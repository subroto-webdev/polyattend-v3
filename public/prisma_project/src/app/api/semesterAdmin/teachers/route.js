import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin', 'subAdmin', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const where = { role: 'teacher' };
    if (auth.user.role !== 'admin') { where.departmentId = auth.user.departmentId; where.shift = auth.user.shift; }
    if (searchParams.get('semester')) { const sem = parseInt(searchParams.get('semester')); where.taughtSubjects = { some: { semester: sem } }; }
    const teachers = await prisma.user.findMany({ where, select: { id: true, name: true, email: true, mobile: true, shift: true, isActive: true, department: { select: { id: true, name: true, code: true } }, taughtSubjects: { select: { id: true, name: true, code: true, semester: true, section: true, shift: true } } }, orderBy: { createdAt: 'desc' } });
    const pendingInvites = await prisma.adminInvite.findMany({ where: { role: 'teacher', departmentId: auth.user.role !== 'admin' ? auth.user.departmentId : undefined, used: false, codeExpire: { gt: new Date() } }, include: { department: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, teachers, pendingInvites });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin', 'admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { name, email, semester, section, subjectName, subjectCode, existingTeacherId } = body;
    const departmentId = auth.user.role !== 'admin' ? auth.user.departmentId : body.departmentId;
    const shift = auth.user.role !== 'admin' ? auth.user.shift : body.shift;
    if (existingTeacherId) {
      const teacher = await prisma.user.findUnique({ where: { id: existingTeacherId } });
      if (!teacher || teacher.role !== 'teacher') return NextResponse.json({ success: false, message: 'Teacher not found' }, { status: 404 });
      const subject = await prisma.subject.upsert({ where: { id: body.subjectId || 'nonexistent' }, update: { teacherId: existingTeacherId }, create: { name: subjectName, code: subjectCode, departmentId, semester: parseInt(semester), section, shift, teacherId: existingTeacherId } });
      if (!teacher.subjectId) await prisma.user.update({ where: { id: existingTeacherId }, data: { subjectId: subject.id } });
      return NextResponse.json({ success: true, message: 'Subject assigned to existing teacher', subject });
    }
    if (!name || !email || !semester || !section || !subjectName || !subjectCode) return NextResponse.json({ success: false, message: 'All fields required' }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();
    const existing = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existing) return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
    const existingInvite = await prisma.adminInvite.findFirst({ where: { email: normalizedEmail, used: false, codeExpire: { gt: new Date() } } });
    if (existingInvite) return NextResponse.json({ success: false, message: 'An invite already exists for this email' }, { status: 400 });
    const code = generateInviteCode();
    const invite = await prisma.adminInvite.create({ data: { role: 'teacher', name, email: normalizedEmail, departmentId, shift, semester: parseInt(semester), section, subjectName, subjectCode, invitedById: auth.user.id, code, codeExpire: oneMonthFromNow() } });
    const { subject, message, html } = inviteCodeEmail({ name, role: 'teacher', code });
    try { await sendEmail({ email: normalizedEmail, subject, message, html }); }
    catch (e) { await prisma.adminInvite.delete({ where: { id: invite.id } }); throw e; }
    return NextResponse.json({ success: true, message: `Invite sent to ${name}`, invite }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    const semAdmins = await prisma.user.findMany({
      where: { role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift },
      select: { id:true, name:true, email:true, shift:true, semesters:true, semester:true, isActive:true, createdAt:true, department: { select: { id:true, name:true, code:true } } },
      orderBy: { createdAt: 'desc' }
    });
    const pendingInvites = await prisma.adminInvite.findMany({
      where: { role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift, used: false, codeExpire: { gt: new Date() } },
      orderBy: { createdAt: 'desc' }
    });
    return NextResponse.json({ success: true, semAdmins, pendingInvites });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    const { name, email, semester } = await request.json();
    if (!name || !email || semester == null) return NextResponse.json({ success: false, message: 'Enter Name, Email and Semester' }, { status: 400 });
    const semInt = parseInt(semester);
    if (isNaN(semInt) || semInt < 1 || semInt > 8) return NextResponse.json({ success: false, message: 'Semester must be between 1 and 8' }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();
    const existingUser = await prisma.user.findFirst({ where: { email: normalizedEmail } });
    if (existingUser) return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
    const existingSemAdmin = await prisma.user.findFirst({ where: { role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift, semester: semInt, isActive: true } });
    if (existingSemAdmin) return NextResponse.json({ success: false, message: `A Semester Admin (${existingSemAdmin.name}) already exists for Semester ${semInt}` }, { status: 400 });
    const existingInvite = await prisma.adminInvite.findFirst({ where: { role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift, semester: semInt, used: false, codeExpire: { gt: new Date() } } });
    if (existingInvite) return NextResponse.json({ success: false, message: `An invite is already pending for Semester ${semInt}` }, { status: 400 });
    const code = generateInviteCode();
    const invite = await prisma.adminInvite.create({ data: { role: 'semesterAdmin', name, email: normalizedEmail, departmentId: auth.user.departmentId, departmentCode: auth.user.departmentCode || null, shift: auth.user.shift, semester: semInt, invitedById: auth.user.id, code, codeExpire: oneMonthFromNow() } });
    const { subject, message, html } = inviteCodeEmail({ name, role: 'semesterAdmin', code });
    try { await sendEmail({ email: normalizedEmail, subject, message, html }); }
    catch (e) { await prisma.adminInvite.delete({ where: { id: invite.id } }); throw e; }
    return NextResponse.json({ success: true, message: `Invite sent to ${name}`, invite }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

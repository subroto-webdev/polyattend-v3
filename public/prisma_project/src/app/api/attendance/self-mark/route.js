import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
function classNameFromSession(s) { return (s?.semester != null && s?.section) ? `Class ${s.semester}-${s.section}` : 'Class unknown'; }
export async function POST(request) {
  const auth = await requireAuth(request, ['student']);
  if (auth.error) return auth.error;
  try {
    const student = auth.user;
    const { sessionId } = await request.json();
    if (!sessionId) return NextResponse.json({ success: false, message: 'sessionId is required' }, { status: 400 });
    const session = await prisma.session.findUnique({ where: { id: sessionId }, include: { subject: { select: { shift: true } } } });
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (session.status !== 'active') return NextResponse.json({ success: false, message: 'This session is no longer active' }, { status: 400 });
    const sessionShift = session.shift || session.subject?.shift;
    const mismatch = !student.departmentId || student.semester !== session.semester || student.section !== session.section || student.departmentId !== session.departmentId || (sessionShift && student.shift !== sessionShift);
    if (mismatch) return NextResponse.json({ success: false, message: 'This session is not for your class' }, { status: 403 });
    const existing = await prisma.attendance.findFirst({ where: { sessionId, studentId: student.id } });
    if (existing?.status === 'present') return NextResponse.json({ success: false, message: 'Your attendance is already marked', attendance: existing }, { status: 400 });
    let attendance;
    if (existing) { attendance = await prisma.attendance.update({ where: { id: existing.id }, data: { status: 'present', scannedAt: new Date(), markedBy: 'self' } }); }
    else { attendance = await prisma.attendance.create({ data: { sessionId, studentId: student.id, subjectId: session.subjectId, departmentId: session.departmentId, semester: session.semester, section: session.section, className: classNameFromSession(session), date: new Date(), status: 'present', scannedAt: new Date(), markedBy: 'self' } }); }
    await prisma.session.update({ where: { id: sessionId }, data: { presentCount: { increment: 1 } } });
    return NextResponse.json({ success: true, message: '✅ Your attendance has been marked', attendance });
  } catch (error) { return errorResponse(error); }
}

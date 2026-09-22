import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
function classNameFromSession(s) { return (s?.semester != null && s?.section) ? `Class ${s.semester}-${s.section}` : 'Class unknown'; }
export async function POST(request) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { sessionId, attendanceList } = body;
    if (!sessionId || !Array.isArray(attendanceList)) return NextResponse.json({ success: false, message: 'sessionId and attendanceList are required' }, { status: 400 });
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (session.status !== 'active') return NextResponse.json({ success: false, message: 'Session not active' }, { status: 400 });
    if (auth.user.role !== 'admin' && session.teacherId !== auth.user.id) return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    if (!session.departmentId || !session.subjectId) return NextResponse.json({ success: false, message: 'Subject/Department data is incomplete' }, { status: 400 });
    const className = classNameFromSession(session);
    const validItems = attendanceList.filter(item => item?.studentId);
    if (!validItems.length) return NextResponse.json({ success: false, message: 'No valid student found' }, { status: 400 });
    await prisma.$transaction(validItems.map(item =>
      prisma.attendance.upsert({
        where: { sessionId_studentId: { sessionId, studentId: item.studentId } },
        update: { status: item.status === 'present' ? 'present' : 'absent', markedBy: 'manual' },
        create: { sessionId, studentId: item.studentId, subjectId: session.subjectId, departmentId: session.departmentId, semester: session.semester, section: session.section, className, date: session.date, status: item.status === 'present' ? 'present' : 'absent', markedBy: 'manual' },
      })
    ));
    const presentCount = validItems.filter(a => a.status === 'present').length;
    await prisma.session.update({ where: { id: sessionId }, data: { presentCount } });
    return NextResponse.json({ success: true, message: 'Attendance saved', presentCount });
  } catch (error) { return errorResponse(error); }
}

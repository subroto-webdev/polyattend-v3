import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { attendanceUpdates } = await request.json();
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role !== 'admin' && session.teacherId !== auth.user.id) return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    if (attendanceUpdates?.length > 0) {
      await prisma.$transaction(attendanceUpdates.map(u => prisma.attendance.update({ where: { id: u.attendanceId }, data: { status: u.status } })));
    }
    const presentCount = await prisma.attendance.count({ where: { sessionId: id, status: 'present' } });
    await prisma.session.update({ where: { id }, data: { presentCount } });
    return NextResponse.json({ success: true, message: 'Attendance updated' });
  } catch (error) { return errorResponse(error); }
}

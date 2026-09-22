import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { status } = await request.json();
    const attendance = await prisma.attendance.update({ where: { id }, data: { status }, include: { student: { select: { id: true, name: true, studentId: true } } } });
    if (!attendance) return NextResponse.json({ success: false, message: 'Record not found' }, { status: 404 });
    const presentCount = await prisma.attendance.count({ where: { sessionId: attendance.sessionId, status: 'present' } });
    await prisma.session.update({ where: { id: attendance.sessionId }, data: { presentCount } });
    return NextResponse.json({ success: true, attendance });
  } catch (error) { return errorResponse(error); }
}

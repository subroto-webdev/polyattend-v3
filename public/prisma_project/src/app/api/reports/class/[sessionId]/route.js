import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const auth = await requireAuth(request, ['teacher','admin','subAdmin','semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { sessionId } = await params;
    const session = await prisma.session.findUnique({
      where: { id: sessionId },
      include: { subject: { select: { id:true, name:true, code:true } }, teacher: { select: { id:true, name:true } }, department: { select: { id:true, name:true, code:true } } }
    });
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    const attendance = await prisma.attendance.findMany({
      where: { sessionId },
      include: { student: { select: { id:true, name:true, studentId:true, section:true } } },
      orderBy: { student: { name: 'asc' } }
    });
    return NextResponse.json({ success: true, session, attendance });
  } catch (error) { return errorResponse(error); }
}

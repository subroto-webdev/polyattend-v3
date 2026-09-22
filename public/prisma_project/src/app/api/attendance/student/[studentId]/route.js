import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { studentId } = await params;
    if (auth.user.role === 'student' && auth.user.id !== studentId)
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const where = { studentId };
    if (subjectId) where.subjectId = subjectId;
    const records = await prisma.attendance.findMany({
      where,
      include: { subject: { select: { id:true, name:true, code:true } }, session: { select: { id:true, date:true } } },
      orderBy: { date: 'desc' }
    });
    return NextResponse.json({ success: true, count: records.length, records });
  } catch (error) { return errorResponse(error); }
}

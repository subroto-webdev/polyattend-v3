import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['teacher','admin','subAdmin','semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const where = {};
    if (subjectId) where.subjectId = subjectId;
    else if (auth.user.role === 'teacher') where.subject = { teacherId: auth.user.id };
    else if (auth.user.role === 'subAdmin') { where.department = { id: auth.user.departmentId }; }
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const missedDates = await prisma.ignoredMiss.findMany({ where: { ...(subjectId ? { subjectId } : {}), date: { gte: sevenDaysAgo } }, include: { subject: { select: { id:true, name:true } }, ignoredBy: { select: { id:true, name:true } } } });
    return NextResponse.json({ success: true, missedDates });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { studentId } = await params;
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    if (auth.user.role === 'student' && auth.user.id !== studentId)
      return NextResponse.json({ success: false, message: 'Forbidden' }, { status: 403 });
    const student = await prisma.user.findUnique({ where: { id: studentId }, select: { id:true, name:true, studentId:true, semester:true, section:true, shift:true, department: { select: { id:true, name:true, code:true } } } });
    if (!student) return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    const where = { studentId };
    if (subjectId) where.subjectId = subjectId;
    const records = await prisma.attendance.findMany({
      where,
      include: { subject: { select: { id:true, name:true, code:true } }, session: { select: { id:true, date:true, status:true } } },
      orderBy: { date: 'desc' }
    });
    const subjects = await prisma.subject.findMany({
      where: { departmentId: student.department?.id || undefined, semester: student.semester || undefined, ...(student.shift ? { shift: student.shift } : {}), isActive: true },
      select: { id:true, name:true, code:true }
    });
    const settings = await prisma.settings.findFirst({ where: { key: 'global' } });
    const threshold = settings?.attendanceThreshold ?? 70;
    const summary = subjects.map(sub => {
      const subRecords = records.filter(r => r.subjectId === sub.id);
      const total = subRecords.length;
      const present = subRecords.filter(r => r.status === 'present').length;
      const pct = total ? Math.round((present / total) * 100) : 0;
      return { subject: sub, total, present, absent: total - present, percentage: pct, belowThreshold: pct < threshold && total > 0 };
    });
    return NextResponse.json({ success: true, student, summary, records, threshold });
  } catch (error) { return errorResponse(error); }
}

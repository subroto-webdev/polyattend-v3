import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request, { params }) {
  const auth = await requireAuth(request, ['teacher','admin','subAdmin','semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { subjectId } = await params;
    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from');
    const to = searchParams.get('to');
    const subject = await prisma.subject.findUnique({ where: { id: subjectId }, include: { department: { select: { id:true, name:true, code:true } }, teacher: { select: { id:true, name:true } } } });
    if (!subject) return NextResponse.json({ success: false, message: 'Subject not found' }, { status: 404 });
    const dateFilter = {};
    if (from) dateFilter.gte = new Date(from);
    if (to) dateFilter.lte = new Date(to);
    const sessions = await prisma.session.findMany({
      where: { subjectId, ...(from||to ? { date: dateFilter } : {}) },
      include: { attendances: { include: { student: { select: { id:true, name:true, studentId:true, section:true } } } } },
      orderBy: { date: 'asc' }
    });
    const students = await prisma.user.findMany({
      where: { role: 'student', departmentId: subject.departmentId, semester: subject.semester, section: subject.section, isActive: true, registered: true, ...(subject.shift ? { shift: subject.shift } : {}) },
      select: { id:true, name:true, studentId:true, section:true },
      orderBy: { name: 'asc' }
    });
    const settings = await prisma.settings.findFirst({ where: { key: 'global' } });
    const threshold = settings?.attendanceThreshold ?? 70;
    const totalSessions = sessions.length;
    const studentSummary = students.map(st => {
      const presents = sessions.filter(s => s.attendances.some(a => a.studentId === st.id && a.status === 'present')).length;
      const pct = totalSessions ? Math.round((presents / totalSessions) * 100) : 0;
      return { ...st, presents, absents: totalSessions - presents, percentage: pct, belowThreshold: pct < threshold && totalSessions > 0 };
    });
    return NextResponse.json({ success: true, subject, sessions, studentSummary, totalSessions, threshold });
  } catch (error) { return errorResponse(error); }
}

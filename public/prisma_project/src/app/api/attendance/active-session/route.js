import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['student']);
  if (auth.error) return auth.error;
  try {
    const student = auth.user;
    if (!student.departmentId || student.semester == null || !student.section) return NextResponse.json({ success: true, session: null, alreadyMarked: false });
    const where = { status: 'active', departmentId: student.departmentId, semester: student.semester, section: student.section };
    if (student.shift) where.shift = student.shift;
    const session = await prisma.session.findFirst({ where, include: { subject: { select: { id: true, name: true, code: true } }, teacher: { select: { id: true, name: true } } }, orderBy: { startTime: 'desc' } });
    if (!session) return NextResponse.json({ success: true, session: null, alreadyMarked: false });
    const existing = await prisma.attendance.findFirst({ where: { sessionId: session.id, studentId: student.id } });
    const alreadyMarked = !!existing && existing.status === 'present';
    return NextResponse.json({ success: true, session, alreadyMarked, markedBy: existing?.markedBy || null });
  } catch (error) { return errorResponse(error); }
}

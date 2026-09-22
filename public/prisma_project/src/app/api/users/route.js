import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin', 'teacher']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const where = {};
    if (searchParams.get('role')) where.role = searchParams.get('role');
    if (searchParams.get('departmentId')) where.departmentId = searchParams.get('departmentId');
    if (searchParams.get('shift')) where.shift = searchParams.get('shift');
    if (searchParams.get('semester')) where.semester = parseInt(searchParams.get('semester'));
    if (searchParams.get('section')) where.section = searchParams.get('section');
    if (auth.user.role === 'subAdmin') { where.departmentId = auth.user.departmentId; where.shift = auth.user.shift; }
    if (auth.user.role === 'semesterAdmin') { where.departmentId = auth.user.departmentId; where.shift = auth.user.shift; if (!where.semester) where.semester = { in: auth.user.semesters || [] }; }
    const users = await prisma.user.findMany({ where, select: { id: true, name: true, email: true, role: true, shift: true, departmentId: true, departmentCode: true, semesters: true, semester: true, section: true, studentId: true, mobile: true, isActive: true, isVerified: true, registered: true, createdAt: true, department: { select: { id: true, name: true, code: true } } }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, users });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
const subjInclude = { department: { select: { id: true, name: true, code: true } }, teacher: { select: { id: true, name: true, email: true } } };
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const where = {};
    if (auth.user.role === 'teacher') where.teacherId = auth.user.id;
    if (auth.user.role === 'subAdmin') { where.departmentId = auth.user.departmentId; where.shift = auth.user.shift; }
    if (auth.user.role === 'semesterAdmin') { where.departmentId = auth.user.departmentId; where.shift = auth.user.shift; where.semester = { in: auth.user.semesters || [] }; }
    if (searchParams.get('departmentId')) where.departmentId = searchParams.get('departmentId');
    if (searchParams.get('shift')) where.shift = searchParams.get('shift');
    if (searchParams.get('semester')) where.semester = parseInt(searchParams.get('semester'));
    if (searchParams.get('section')) where.section = searchParams.get('section');
    if (searchParams.get('isActive') !== null) where.isActive = searchParams.get('isActive') !== 'false';
    const subjects = await prisma.subject.findMany({ where, include: subjInclude, orderBy: { name: 'asc' } });
    return NextResponse.json({ success: true, subjects });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const subject = await prisma.subject.create({ data: { name: body.name, code: body.code, departmentId: body.departmentId, semester: parseInt(body.semester), section: body.section, shift: body.shift, teacherId: body.teacherId || null }, include: subjInclude });
    return NextResponse.json({ success: true, subject }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

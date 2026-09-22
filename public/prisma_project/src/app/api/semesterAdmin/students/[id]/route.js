import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const student = await prisma.user.findUnique({ where: { id } });
    if (!student || student.role !== 'student') return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    if (student.departmentId !== auth.user.departmentId || student.shift !== auth.user.shift || !( auth.user.semesters||[]).includes(student.semester))
      return NextResponse.json({ success: false, message: 'Outside your scope' }, { status: 403 });
    const updated = await prisma.user.update({ where: { id }, data: { section: body.section, semester: body.semester ? parseInt(body.semester) : undefined, isActive: body.isActive } });
    return NextResponse.json({ success: true, student: updated });
  } catch (error) { return errorResponse(error, 400); }
}
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const student = await prisma.user.findUnique({ where: { id } });
    if (!student || student.role !== 'student') return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    if (student.departmentId !== auth.user.departmentId || student.shift !== auth.user.shift || !(auth.user.semesters||[]).includes(student.semester))
      return NextResponse.json({ success: false, message: 'Outside your scope' }, { status: 403 });
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: 'Student deactivated' });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { studentIds, fromSemester } = await request.json();
    if (!Array.isArray(studentIds) || !studentIds.length) return NextResponse.json({ success: false, message: 'Select at least one Student' }, { status: 400 });
    const allowedSemesters = auth.user.semesters || [];
    const currentSemester = fromSemester!=null ? parseInt(fromSemester) : (allowedSemesters.length===1 ? allowedSemesters[0] : null);
    if (currentSemester==null) return NextResponse.json({ success: false, message: 'Select which Semester to promote from' }, { status: 400 });
    if (!allowedSemesters.includes(currentSemester)) return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    if (currentSemester >= 8) return NextResponse.json({ success: false, message: 'Cannot promote from Semester 8' }, { status: 400 });
    const result = await prisma.user.updateMany({ where: { id: { in: studentIds }, role: 'student', departmentId: auth.user.departmentId, shift: auth.user.shift, semester: currentSemester }, data: { semester: currentSemester + 1 } });
    return NextResponse.json({ success: true, message: `${result.count} Student(s) promoted to Semester ${currentSemester + 1}`, promotedCount: result.count });
  } catch (error) { return errorResponse(error); }
}

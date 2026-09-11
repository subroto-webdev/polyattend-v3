import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users/lookup-by-roll?roll=...
// Quick single-student lookup by Roll (studentId) for the Dashboard
// "Search by Roll" box — Super Admin, Sub Admin, Semester Admin. Returns
// the student's basic info + Mobile Number. Scoped the same way as the
// rest of the app: Sub Admin only within their own Department+Shift,
// Semester Admin only within their own Department+Shift+Semester, Super
// Admin unrestricted.
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin', 'teacher']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const roll = (searchParams.get('roll') || '').trim();
    if (!roll) return NextResponse.json({ success: false, message: 'Enter Roll' }, { status: 400 });

    const filter = { role: 'student', studentId: roll };
    if (auth.user.role === 'subAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'semesterAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
      filter.semester = { $in: auth.user.semesters || [] };
    }
    if (auth.user.role === 'teacher') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }

    const student = await User.findOne(filter).select('-password').populate('departmentId', 'name code');
    if (!student) {
      return NextResponse.json({ success: false, message: 'No Student found with this Roll (within your scope)' }, { status: 404 });
    }

    return NextResponse.json({ success: true, student });
  } catch (error) { return errorResponse(error); }
}

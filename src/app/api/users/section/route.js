import { NextResponse } from 'next/server';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users/section - Get students by dept/sem/section (with shift)
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('departmentId');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const shift = searchParams.get('shift');

    // STUDENT PROFILE-FIRST VALIDATION: exclude unregistered shadow
    // profiles (see User model) — this is an attendance-roster lookup,
    // not the Student Validation queue.
    const filter = { role: 'student', departmentId, semester: parseInt(semester), section, isActive: true, registered: { $ne: false } };
    if (shift) filter.shift = shift;

    const students = await User.find(filter).select('-password').populate('departmentId', 'name code').lean();
    return NextResponse.json({ success: true, count: students.length, students });
  } catch (error) { return errorResponse(error); }
}

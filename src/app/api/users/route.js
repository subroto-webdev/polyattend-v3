import { NextResponse } from 'next/server';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users - Admin/Sub Admin/Semester Admin/Teacher: get all users (list + search)
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin', 'teacher']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');
    const departmentId = searchParams.get('departmentId');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const shift = searchParams.get('shift');
    const search = searchParams.get('search');

    const filter = {};
    if (role) filter.role = role;
    if (departmentId) filter.departmentId = departmentId;
    if (semester) filter.semester = parseInt(semester);
    if (section) filter.section = section;
    if (shift) filter.shift = shift;
    if (search) {
      // SECURITY FIX: `search` was interpolated directly into $regex. A
      // crafted value (e.g. unbalanced parentheses, or a catastrophic
      // backtracking pattern like many nested repeats) could crash the
      // query or degrade into a ReDoS. Escape regex metacharacters so the
      // search term is always treated as a literal substring.
      const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      filter.$or = [
        { name: { $regex: escaped, $options: 'i' } },
        { email: { $regex: escaped, $options: 'i' } },
        { studentId: { $regex: escaped, $options: 'i' } },
      ];
    }

    if (auth.user.role === 'teacher' && role === 'student') {
      filter.shift = auth.user.shift;
    }

    // SCOPE ENFORCEMENT: a Sub Admin only ever sees their own
    // Department+Shift; a Semester Admin only their own
    // Department+Shift+Semester. This overrides whatever the caller passed
    // for these fields — a scoped admin cannot widen their own view by
    // querying with a different departmentId/shift/semester.
    if (auth.user.role === 'subAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'semesterAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
      filter.semester = auth.user.semester;
    }

    const users = await User.find(filter).select('-password').populate('departmentId', 'name code').sort({ createdAt: -1 });
    return NextResponse.json({ success: true, count: users.length, users });
  } catch (error) { return errorResponse(error); }
}

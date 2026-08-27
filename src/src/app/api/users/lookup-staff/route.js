import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users/lookup-staff?name=...
// Search Teachers and Admin-level accounts by name (partial match) to find
// their Mobile Number — the Staff counterpart to /users/lookup-by-roll
// (which is Students only, by exact Roll).
//
// Scope:
//   - Super Admin: searches Teachers, Sub Admins, Semester Admins, and
//     other Super Admins, across every Department.
//   - Sub Admin / Semester Admin: Teachers only, within their own
//     Department + Shift (+ Semester for Semester Admin) — searching
//     other Admin accounts' numbers is reserved for Super Admin.
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const name = (searchParams.get('name') || '').trim();
    if (!name) return NextResponse.json({ success: false, message: 'Enter a name' }, { status: 400 });

    const roles = auth.user.role === 'admin'
      ? ['teacher', 'subAdmin', 'semesterAdmin', 'admin']
      : ['teacher'];

    const filter = {
      role: { $in: roles },
      name: { $regex: name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' },
    };
    if (auth.user.role === 'subAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'semesterAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
      filter.semester = auth.user.semester;
    }

    const staff = await User.find(filter)
      .select('name email mobile role departmentId shift semester')
      .populate('departmentId', 'name code')
      .limit(20);

    return NextResponse.json({ success: true, staff });
  } catch (error) { return errorResponse(error); }
}

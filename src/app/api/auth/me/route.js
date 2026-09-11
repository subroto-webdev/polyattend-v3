import { NextResponse } from 'next/server';
import User from '@/lib/models/User';
import { requireAuth, errorResponse, normalizeSemesterAdmin } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const user = await User.findById(auth.user._id).select('-password')
      .populate('departmentId', 'name code')
      .populate('subjectId', 'name code semester section shift');
    // MULTI-SEMESTER ADMIN: same legacy-account fallback as requireAuth,
    // applied here too since this route re-fetches fresh from the DB and
    // is what the frontend/AuthContext actually renders from.
    normalizeSemesterAdmin(user);
    return NextResponse.json({ success: true, user });
  } catch (error) { return errorResponse(error); }
}

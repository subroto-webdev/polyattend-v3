import { NextResponse } from 'next/server';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const user = await User.findById(auth.user._id).select('-password')
      .populate('departmentId', 'name code')
      .populate('subjectId', 'name code semester section shift');
    return NextResponse.json({ success: true, user });
  } catch (error) { return errorResponse(error); }
}

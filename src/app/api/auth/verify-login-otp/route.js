import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { generateToken, errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify-login-otp
// Step 2 of the Super Admin / Sub Admin / Semester Admin login flow.
// Only issues a token once the OTP emailed at step 1 (see /api/auth/login)
// is confirmed — a correct password alone never issues a token for these
// roles.
export async function POST(request) {
  await dbConnect();
  try {
    const { email, otp } = await request.json();
    if (!email || !otp) {
      return NextResponse.json({ success: false, message: 'Enter Email and OTP' }, { status: 400 });
    }
    const normalizedEmail = email.toLowerCase().trim();

    // RATE LIMIT: a 6-digit OTP only has 1,000,000 combinations and is
    // valid for 10 minutes, so this cap (6 tries / 10 min per email) is
    // what actually makes it safe against brute-forcing, not the OTP
    // length alone.
    const limited = checkRateLimit(request, 'verify-login-otp', normalizedEmail, { limit: 6, windowMs: 10 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const user = await User.findOne({
      email: normalizedEmail, loginOTP: otp, loginOTPExpire: { $gt: new Date() },
    }).populate('departmentId', 'name code');

    if (!user) {
      return NextResponse.json({ success: false, message: 'Wrong OTP or the OTP has expired' }, { status: 400 });
    }
    if (!user.isActive) {
      return NextResponse.json({ success: false, message: 'Account is deactivated' }, { status: 403 });
    }

    user.loginOTP = null;
    user.loginOTPExpire = null;
    await user.save();

    const token = generateToken(user._id);
    return NextResponse.json({
      success: true,
      token,
      user: {
        _id: user._id, name: user.name, email: user.email, role: user.role, shift: user.shift,
        studentId: user.studentId, departmentId: user.departmentId, departmentCode: user.departmentCode,
        semester: user.semester, section: user.section, subjectId: user.subjectId,
      },
    });
  } catch (error) { return errorResponse(error); }
}

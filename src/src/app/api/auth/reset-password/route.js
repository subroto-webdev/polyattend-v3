import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { errorResponse } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validatePassword';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  await dbConnect();
  try {
    const { email, otp, newPassword } = await request.json();
    if (!email || !otp || !newPassword) return NextResponse.json({ success: false, message: 'Enter all fields' }, { status: 400 });
    const pwCheck = isStrongPassword(newPassword);
    if (!pwCheck.ok) return NextResponse.json({ success: false, message: pwCheck.message }, { status: 400 });

    // RATE LIMIT: same reasoning as verify-login-otp — a 6-digit OTP
    // needs a low attempt cap to actually resist brute-forcing within
    // its 10-minute validity window.
    const limited = checkRateLimit(request, 'reset-password', email, { limit: 6, windowMs: 10 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const user = await User.findOne({ email, resetPasswordOTP: otp, resetPasswordExpire: { $gt: Date.now() } });
    if (!user) return NextResponse.json({ success: false, message: 'Wrong OTP or the OTP has expired' }, { status: 400 });

    user.password = newPassword;
    user.isVerified = true;
    user.resetPasswordOTP = null;
    user.resetPasswordExpire = null;
    await user.save();

    return NextResponse.json({ success: true, message: 'Password changed successfully. Please log in with your new password.' });
  } catch (error) { return errorResponse(error); }
}

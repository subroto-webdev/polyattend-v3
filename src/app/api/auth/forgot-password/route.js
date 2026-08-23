import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import sendEmail from '@/lib/sendEmail';
import { errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// SECURITY FIX (user enumeration): this used to return a distinct
// "No account found with this email" (404) vs "This account is
// deactivated" (403) vs success — which let anyone check, email by
// email, exactly which addresses have an account and whether that
// account is active, with zero authentication. Every outcome below
// now returns the SAME generic success message; the OTP email is only
// actually sent if a matching, active account exists. The only thing
// that still varies is timing (DB lookup + optional email send vs an
// immediate return) — that residual signal is much harder to exploit
// than a direct message difference and is an accepted tradeoff here.
const GENERIC_MESSAGE = 'If an account exists with this email, a password reset OTP has been sent.';

export async function POST(request) {
  await dbConnect();
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ success: false, message: 'Enter email address' }, { status: 400 });

    // RATE LIMIT: also closes off using this endpoint's timing/send
    // behavior as a slow enumeration oracle, and stops it being used to
    // spam a real user's inbox with reset emails.
    const limited = checkRateLimit(request, 'forgot-password', email, { limit: 5, windowMs: 15 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const user = await User.findOne({ email });
    if (!user || !user.isActive) {
      return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.resetPasswordOTP = otp;
    user.resetPasswordExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const subject = 'PolyAttend Password Reset OTP';
    const message = `Hello ${user.name},\n\nYou requested to reset your password. Please use the following 6-digit OTP to proceed:\n\nOTP Code: ${otp}\n\nThis OTP is valid for 10 minutes. If you did not request this, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #1a6b4a; text-align: center;">Reset Your Password</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>We received a request to reset your password. Use the following 6-digit OTP code to complete the process:</p>
        <div style="background-color: #fffbeb; border: 2px dashed #f59e0b; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #b45309; letter-spacing: 5px;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes. If you did not request this reset, please ignore this email.</p>
      </div>`;

    try {
      await sendEmail({ email: user.email, subject, message, html });
    } catch (mailErr) {
      // Don't leave a live OTP set on the account if the email never
      // actually went out, and don't let a mail-provider failure leak
      // through as a different response than the generic one.
      user.resetPasswordOTP = null;
      user.resetPasswordExpire = null;
      await user.save().catch(() => {});
      console.error('[forgot-password] email send failed', mailErr);
    }

    return NextResponse.json({ success: true, message: GENERIC_MESSAGE });
  } catch (error) { return errorResponse(error); }
}

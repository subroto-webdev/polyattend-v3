import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import PendingRegistration from '@/lib/models/PendingRegistration';
import sendEmail from '@/lib/sendEmail';
import { errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  await dbConnect();
  try {
    const { email } = await request.json();
    if (!email) return NextResponse.json({ success: false, message: 'Enter email' }, { status: 400 });
    const normalizedEmail = email.toLowerCase().trim();

    // RATE LIMIT: backstop against one IP cycling through many emails to
    // trigger sends — the existing 2-minute per-email cooldown below
    // already stops repeated hits on ONE email, but not a rotating one.
    const limited = checkRateLimit(request, 'resend-verification', normalizedEmail, { limit: 10, windowMs: 15 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    // ── FIX (Requirement #5): most signups now live in PendingRegistration,
    // not User, until they verify. Check there first.
    const pending = await PendingRegistration.findOne({ email: normalizedEmail });

    if (pending) {
      const remaining = pending.otpExpire ? pending.otpExpire.getTime() - Date.now() : 0;
      if (remaining > 2 * 60 * 1000) {
        const mins = Math.ceil(remaining / 60000);
        return NextResponse.json({ success: false, message: `Please wait ${mins} minute(s)` }, { status: 429 });
      }

      const otp = Math.floor(100000 + Math.random() * 900000).toString();
      pending.otp = otp;
      pending.otpExpire = new Date(Date.now() + 10 * 60 * 1000);
      await pending.save();

      const html = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1a6b4a; text-align: center;">Email Verification</h2>
          <p>Hello <strong>${pending.name}</strong>,</p>
          <p>Your new verification code:</p>
          <div style="background-color: #f0fdf4; border: 2px dashed #1a6b4a; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
            <span style="font-size: 28px; font-weight: bold; color: #1a6b4a; letter-spacing: 8px;">${otp}</span>
          </div>
          <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes.</p>
        </div>`;

      await sendEmail({ email: pending.email, subject: 'PolyAttend — New Verification Code', message: `Your new OTP: ${otp}`, html });
      return NextResponse.json({ success: true, message: 'New OTP sent' });
    }

    // Legacy path: an already-created User document still awaiting verification.
    const user = await User.findOne({ email: normalizedEmail });
    if (!user) return NextResponse.json({ success: false, message: 'No account exists with this email' }, { status: 404 });
    if (user.isVerified) return NextResponse.json({ success: false, message: 'This account is already verified' }, { status: 400 });

    const remaining = user.verificationExpire ? user.verificationExpire.getTime() - Date.now() : 0;
    if (remaining > 2 * 60 * 1000) {
      const mins = Math.ceil(remaining / 60000);
      return NextResponse.json({ success: false, message: `Please wait ${mins} minute(s)` }, { status: 429 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    user.verificationOTP = otp;
    user.verificationExpire = new Date(Date.now() + 10 * 60 * 1000);
    await user.save();

    const subject = 'PolyAttend — New Verification Code';
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
        <h2 style="color: #1a6b4a; text-align: center;">Email Verification</h2>
        <p>Hello <strong>${user.name}</strong>,</p>
        <p>Your new verification code:</p>
        <div style="background-color: #f0fdf4; border: 2px dashed #1a6b4a; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <span style="font-size: 28px; font-weight: bold; color: #1a6b4a; letter-spacing: 8px;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes.</p>
      </div>`;

    await sendEmail({ email: user.email, subject, message: `Your new OTP: ${otp}`, html });
    return NextResponse.json({ success: true, message: 'New OTP sent' });
  } catch (error) { return errorResponse(error); }
}

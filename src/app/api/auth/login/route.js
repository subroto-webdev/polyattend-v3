import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import sendEmail from '@/lib/sendEmail';
import { generateToken, errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// Roles that require a second OTP step after password verification —
// Super Admin, Sub Admin, and Semester Admin all hold elevated,
// account-creating permissions, so a stolen password alone shouldn't be
// enough to log in as any of them.
//
// TEMPORARILY DISABLED (per request): set to true to re-enable — the rest
// of the 2FA implementation (OTP generation/email, verify-login-otp route,
// frontend OTP step) is untouched, this flag is the only thing gating it.
const TWO_FA_ENABLED = false;
const REQUIRES_2FA = TWO_FA_ENABLED ? ['admin', 'subAdmin', 'semesterAdmin'] : [];

function generateOTP() {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export async function POST(request) {
  await dbConnect();
  try {
    const { email, password } = await request.json();
    if (!email || !password) {
      return NextResponse.json({ success: false, message: 'Please provide email and password' }, { status: 400 });
    }

    // RATE LIMIT: 8 attempts per 15 min per IP, 16 per 15 min per email —
    // stops both a single IP hammering many accounts and a distributed
    // attempt at one account. See lib/rateLimit.js for the tradeoffs of
    // the in-memory store used here.
    const limited = checkRateLimit(request, 'login', email, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const user = await User.findOne({ email })
      .populate('departmentId', 'name code')
      .populate('subjectId', 'name code semester section shift');
    if (!user) return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 });
    if (!user.isActive) return NextResponse.json({ success: false, message: 'Account is deactivated' }, { status: 403 });
    if (!(await user.matchPassword(password))) {
      return NextResponse.json({ success: false, message: 'Invalid email or password' }, { status: 401 });
    }

    if (REQUIRES_2FA.includes(user.role)) {
      const otp = generateOTP();
      user.loginOTP = otp;
      user.loginOTPExpire = new Date(Date.now() + 10 * 60 * 1000);
      await user.save();

      const { subject, message, html } = (() => {
        const s = 'PolyAttend — Login Verification Code';
        const m = `Hello ${user.name},\n\nUse the following OTP to complete your Login:\n\nOTP: ${otp}\n\nThis OTP is valid for 10 minutes. If you did not attempt this login, please ignore this email and change your password.`;
        const h = `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
            <h2 style="color: #1a6b4a; text-align: center;">🔐 Login Verification</h2>
            <p>Hello <strong>${user.name}</strong>,</p>
            <p>Use the following OTP to complete your Login:</p>
            <div style="background-color: #f0fdf4; border: 2px dashed #1a6b4a; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
              <span style="font-size: 26px; font-weight: bold; color: #1a6b4a; letter-spacing: 6px;">${otp}</span>
            </div>
            <p style="color: #64748b; font-size: 13px;">This OTP is valid for 10 minutes. If you did not attempt this login, please ignore this email and change your password.</p>
          </div>`;
        return { subject: s, message: m, html: h };
      })();

      await sendEmail({ email: user.email, subject, message, html });

      return NextResponse.json({
        success: true,
        requiresOtp: true,
        email: user.email,
        message: 'Login OTP has been sent to your email',
      });
    }

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

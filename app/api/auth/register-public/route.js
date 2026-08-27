import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import PendingRegistration from '@/lib/models/PendingRegistration';
import StudentPreApproval from '@/lib/models/StudentPreApproval';
import sendEmail from '@/lib/sendEmail';
import { errorResponse } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validatePassword';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST /api/auth/register-public
// ── FIX (Requirement #5) ────────────────────────────────────────────────
// No real User is created here anymore. The submitted data is held in a
// PendingRegistration doc (hashed password, same as before) alongside a
// fresh OTP. The real account only gets created in /api/auth/verify-email
// once that OTP is confirmed — so anyone who abandons signup before
// verifying leaves nothing permanent in the User collection.
export async function POST(request) {
  await dbConnect();
  try {
    const { name, email, password, role, studentId, departmentId, semester, section, shift, preApprovalCode, mobile } = await request.json();

    // RATE LIMIT: this endpoint checks a 12-digit preApprovalCode — this
    // cap is what stops that code from being brute-forced, and also
    // limits general signup-spam / DB-write / email-send abuse from a
    // single IP or against a single email.
    const limited = checkRateLimit(request, 'register-public', email, { limit: 8, windowMs: 15 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    // MISTAKE FIX: Teacher self-registration via a single shared
    // TEACHER_SECRET_KEY (same value for everyone, anyone who learned it
    // could become a Teacher with no admin approval) has been removed.
    // Teachers are now only created through the Semester Admin → Teacher
    // invite flow (12-digit code, scoped to a specific Department/Shift/
    // Semester/Group/Subject). This route now only handles Student
    // self-registration.
    if (role !== 'student') {
      return NextResponse.json({ success: false, message: 'Only Students can register here. Teacher accounts are created via an invite sent by your Semester Admin.' }, { status: 400 });
    }
    if (!name || !email || !password || !role) {
      return NextResponse.json({ success: false, message: 'Enter Name, Email, Password and role' }, { status: 400 });
    }
    const pwCheck = isStrongPassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ success: false, message: pwCheck.message }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Already a real, registered account?
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });

    if (!studentId || !departmentId || !semester || !section || !shift) {
      return NextResponse.json({ success: false, message: 'Enter Student ID, Department, Semester, Group and Shift' }, { status: 400 });
    }
    // SECURITY: mobile was previously optional and only checked on the
    // frontend — a direct API call could skip it entirely. Now enforced
    // server-side too, since client-side validation alone can always be
    // bypassed.
    if (!mobile || !mobile.trim()) {
      return NextResponse.json({ success: false, message: 'Mobile Number is required' }, { status: 400 });
    }
    if (!/^01[0-9]{9}$/.test(mobile.trim())) {
      return NextResponse.json({ success: false, message: 'Enter a valid 11-digit mobile number (e.g. 01XXXXXXXXX)' }, { status: 400 });
    }
    const existingStudent = await User.findOne({ studentId });
    if (existingStudent) return NextResponse.json({ success: false, message: 'This Student ID is already registered' }, { status: 400 });

    // VALIDATION: a student can only register with a Roll+Email that a
    // Semester Admin pre-approved (single entry or bulk Excel upload) and
    // the matching 12-digit code — this is what stops one person
    // registering multiple times under different emails, since only
    // whitelisted Roll+Email pairs are ever accepted here. Once a
    // pre-approval is used it's marked used and can never register again.
    if (!preApprovalCode) {
      return NextResponse.json({ success: false, message: 'Enter the 12-digit Registration Code sent by your Semester Admin' }, { status: 400 });
    }
    const preApproval = await StudentPreApproval.findOne({
      roll: studentId.trim(),
      email: normalizedEmail,
      code: preApprovalCode.trim().toUpperCase(),
      used: false,
      codeExpire: { $gt: new Date() },
    });
    if (!preApproval) {
      return NextResponse.json({ success: false, message: 'Roll, Email or Code does not match, or the Code has expired. Please contact your Semester Admin.' }, { status: 400 });
    }

    // The Semester Admin's pre-approval is the source of truth for
    // department/semester/shift (see below) — but if what the student
    // picked in the form doesn't match it at all, that's worth surfacing
    // rather than silently switching them into a different scope than
    // they expected.
    if (String(preApproval.departmentId) !== String(departmentId) || String(preApproval.semester) !== String(semester) || preApproval.shift !== shift) {
      return NextResponse.json({
        success: false,
        message: 'Your selected Department/Semester/Shift does not match what was set for your Roll. Please select the correct Department/Semester/Shift, or contact your Semester Admin.',
      }, { status: 400 });
    }

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000);

    // Replace any earlier, never-verified attempt for this email with a fresh one.
    await PendingRegistration.deleteMany({ email: normalizedEmail });

    // BUG FIX: previously this used the department/semester/shift the
    // student themselves picked in the registration form's dropdowns —
    // never checked against what the Semester Admin actually pre-approved.
    // A wrong dropdown pick (or a stale default) silently created the
    // account in the wrong scope, so it never matched any Sub Admin's or
    // Semester Admin's filter (only the unscoped Super Admin saw it). The
    // pre-approval entry is the source of truth for these three fields —
    // the student's own selection is now ignored for them, and `section`
    // (Group) is the only one still taken from the form since pre-approval
    // doesn't record a Group.
    const pending = await PendingRegistration.create({
      name, email: normalizedEmail, password, role: 'student',
      studentId, departmentId: preApproval.departmentId, semester: preApproval.semester, section, shift: preApproval.shift,
      preApprovalId: preApproval._id,
      mobile: mobile.trim(),
      otp, otpExpire,
    });

    const subject = 'PolyAttend Email Verification Code';
    const message = `Hello ${name},\n\nWelcome to PolyAttend. Please use the following One-Time Password (OTP) to verify your email address:\n\nVerification Code: ${otp}\n\nThis OTP is valid for 10 minutes. If you did not register for this account, please ignore this email.`;
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #ffffff;">
        <h2 style="color: #1a6b4a; text-align: center;">Welcome to PolyAttend</h2>
        <p>Hello <strong>${name}</strong>,</p>
        <p>Thank you for registering at PolyAttend. To complete your registration, please verify your email address using the following code:</p>
        <div style="background-color: #f0fdf4; border: 2px dashed #1a6b4a; border-radius: 8px; padding: 15px; text-align: center; margin: 20px 0;">
          <span style="font-size: 24px; font-weight: bold; color: #1a6b4a; letter-spacing: 5px;">${otp}</span>
        </div>
        <p style="color: #64748b; font-size: 13px;">This code is valid for 10 minutes. If you did not create this account, please ignore this email.</p>
      </div>`;

    try {
      await sendEmail({ email: pending.email, subject, message, html });
    } catch (mailErr) {
      // Email sending failed — don't leave an orphaned pending record behind.
      await PendingRegistration.findByIdAndDelete(pending._id);
      throw mailErr;
    }

    return NextResponse.json({
      success: true,
      message: 'Registration successful! Please check your email for the verification code.',
      email: pending.email,
      requiresVerification: true,
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

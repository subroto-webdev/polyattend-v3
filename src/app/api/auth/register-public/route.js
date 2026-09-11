import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import PendingRegistration from '@/lib/models/PendingRegistration';
import sendEmail from '@/lib/sendEmail';
import { errorResponse } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validatePassword';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST /api/auth/register-public
// ── FIX (Requirement #5) ────────────────────────────────────────────────
// No real, LOGGABLE-IN account is finalized here. The submitted data is
// held in a PendingRegistration doc (hashed password, same as before)
// alongside a fresh OTP. The account only gets finalized in
// /api/auth/verify-email once that OTP is confirmed.
//
// STUDENT PROFILE-FIRST VALIDATION: a Student's User document (role
// 'student') already exists from the moment their Semester Admin
// validated their Roll+Email+Group — with Name/Password still empty and
// `registered: false` (see User model). This route finds THAT SAME
// shadow document (instead of a separate StudentPreApproval record) and
// checks the Roll+Email+Code against it; verify-email later fills in
// Name/Password on it directly, rather than creating a second document.
//
// SIMPLIFIED FORM: Department/Semester/Group/Shift are no longer taken
// from the Student at all — their Semester Admin already fixed all four
// on the shadow profile, so there's nothing left to pick (or get wrong).
// They only ever come from `shadow.*` below.
export async function POST(request) {
  await dbConnect();
  try {
    const { name, email, password, role, studentId, preApprovalCode, mobile } = await request.json();

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

    // Already a real, FULLY REGISTERED account? A shadow profile
    // (registered: false) sharing this exact Email is expected — that's
    // the one this registration is meant to complete — so it's excluded
    // here rather than rejected as a conflict.
    const existing = await User.findOne({ email: normalizedEmail, registered: { $ne: false } });
    if (existing) return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });

    if (!studentId) {
      return NextResponse.json({ success: false, message: 'Enter your Student Roll' }, { status: 400 });
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
    // Same reasoning as the Email check above — a shadow profile with
    // this Roll is expected and excluded, only a FULLY REGISTERED
    // duplicate Roll is a real conflict.
    const existingStudent = await User.findOne({ studentId, registered: { $ne: false } });
    if (existingStudent) return NextResponse.json({ success: false, message: 'This Student ID is already registered' }, { status: 400 });

    // VALIDATION: a student can only register with a Roll+Email that a
    // Semester Admin already validated (single entry or bulk Excel
    // upload — see /api/semesterAdmin/students) and the matching 12-digit
    // code — this is what stops one person registering multiple times
    // under different emails, since only whitelisted Roll+Email pairs
    // ever have a shadow profile to match against. Once used, that
    // profile is flipped to `registered: true` (see verify-email) and can
    // never be re-registered.
    if (!preApprovalCode) {
      return NextResponse.json({ success: false, message: 'Enter the 12-digit Registration Code sent by your Semester Admin' }, { status: 400 });
    }
    const shadow = await User.findOne({
      studentId: studentId.trim(),
      email: normalizedEmail,
      role: 'student',
      registered: false,
      regCode: preApprovalCode.trim().toUpperCase(),
      regCodeExpire: { $gt: new Date() },
    });
    if (!shadow) {
      return NextResponse.json({ success: false, message: 'Roll, Email or Code does not match, or the Code has expired. Please contact your Semester Admin.' }, { status: 400 });
    }
    // Department/Semester/Shift/Group only ever come from the shadow
    // profile itself now — there is nothing left to cross-check against a
    // student-supplied value, since the form no longer asks for them.

    const otp = Math.floor(100000 + Math.random() * 900000).toString();
    const otpExpire = new Date(Date.now() + 10 * 60 * 1000);

    // Replace any earlier, never-verified attempt for this email with a fresh one.
    await PendingRegistration.deleteMany({ email: normalizedEmail });

    const pending = await PendingRegistration.create({
      name, email: normalizedEmail, password, role: 'student',
      studentId, departmentId: shadow.departmentId, semester: shadow.semester, section: shadow.section, shift: shadow.shift,
      shadowStudentId: shadow._id,
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

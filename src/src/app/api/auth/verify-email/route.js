import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import PendingRegistration from '@/lib/models/PendingRegistration';
import StudentPreApproval from '@/lib/models/StudentPreApproval';
import { errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify-email
// ── FIX (Requirement #5) ────────────────────────────────────────────────
// The real User account is created here, and only here — after the OTP the
// person submits matches a still-valid PendingRegistration. Nothing is
// written to the User collection before this point, so an abandoned or
// failed verification leaves no account behind.
//
// This same endpoint also still supports the older "already-created but
// unverified" User flow (for any account that existed before this fix, or
// was created by an admin) so existing OTP emails already sent don't break.
export async function POST(request) {
  await dbConnect();
  try {
    const { email, otp } = await request.json();
    if (!email || !otp) return NextResponse.json({ success: false, message: 'Enter Email and OTP' }, { status: 400 });

    const normalizedEmail = email.toLowerCase().trim();

    // RATE LIMIT: same reasoning as the login/reset OTP endpoints — a
    // 6-digit code needs a low attempt cap to resist brute-forcing.
    const limited = checkRateLimit(request, 'verify-email', normalizedEmail, { limit: 6, windowMs: 10 * 60 * 1000 });
    if (limited) {
      return NextResponse.json({ success: false, message: limited.message }, { status: 429, headers: { 'Retry-After': String(limited.retryAfterSeconds) } });
    }

    const pending = await PendingRegistration.findOne({
      email: normalizedEmail, otp, otpExpire: { $gt: Date.now() },
    });

    if (pending) {
      // Re-check for race conditions: someone else may have grabbed this
      // email or studentId while this OTP was outstanding.
      const emailTaken = await User.findOne({ email: pending.email });
      if (emailTaken) {
        await PendingRegistration.findByIdAndDelete(pending._id);
        return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
      }
      if (pending.role === 'student' && pending.studentId) {
        const studentIdTaken = await User.findOne({ studentId: pending.studentId });
        if (studentIdTaken) {
          await PendingRegistration.findByIdAndDelete(pending._id);
          return NextResponse.json({ success: false, message: 'This Student ID is already registered' }, { status: 400 });
        }
      }

      // IMPORTANT: pending.password is already bcrypt-hashed (PendingRegistration
      // has its own pre-save hash hook). If we went through `new User(...).save()`,
      // User's own pre-save hook would see password as "modified" on this brand-new
      // document and hash it a SECOND time — locking the person out of the account
      // they just verified. To avoid that, insert the already-hashed password
      // directly via the native collection, bypassing Mongoose's pre-save hook.
      // Mobile comes only from the student's own registration form (stored
      // in PendingRegistration) — StudentPreApproval no longer collects a
      // Mobile Number (Semester Admin pre-approval is Roll + Email only).
      let createdBy;
      const mobile = pending.mobile;
      if (pending.preApprovalId) {
        const preApproval = await StudentPreApproval.findById(pending.preApprovalId);
        if (preApproval) createdBy = preApproval.addedBy;
      }

      const now = new Date();
      const insertResult = await User.collection.insertOne({
        name: pending.name,
        email: pending.email,
        password: pending.password,
        role: pending.role,
        studentId: pending.studentId,
        departmentId: pending.departmentId,
        semester: pending.semester,
        section: pending.section,
        shift: pending.shift,
        mobile,
        createdBy,
        isActive: true,
        isVerified: true,
        verificationOTP: null,
        verificationExpire: null,
        resetPasswordOTP: null,
        resetPasswordExpire: null,
        createdAt: now,
        updatedAt: now,
      });

      // VALIDATION: only now — after a real, verified account actually
      // exists — is the Roll+Email pre-approval consumed. This is the step
      // that permanently prevents that same Roll/Email from ever being
      // used to register a second account.
      if (pending.preApprovalId) {
        await StudentPreApproval.findByIdAndUpdate(pending.preApprovalId, {
          used: true, usedAt: now, usedByUserId: insertResult.insertedId,
        });
      }

      await PendingRegistration.findByIdAndDelete(pending._id);

      return NextResponse.json({ success: true, message: 'Email verification successful! You can now log in.' });
    }

    // Fallback: legacy path for a User document that was already created
    // (e.g. by an admin, or from before this fix) and just needs the flag flipped.
    const user = await User.findOne({ email: normalizedEmail, verificationOTP: otp, verificationExpire: { $gt: Date.now() } });
    if (!user) return NextResponse.json({ success: false, message: 'Wrong OTP or the OTP has expired' }, { status: 400 });

    user.isVerified = true;
    user.verificationOTP = null;
    user.verificationExpire = null;
    await user.save();

    return NextResponse.json({ success: true, message: 'Email verification successful! You can now log in.' });
  } catch (error) { return errorResponse(error); }
}

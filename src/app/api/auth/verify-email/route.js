import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import PendingRegistration from '@/lib/models/PendingRegistration';
import { errorResponse } from '@/lib/auth';
import { checkRateLimit } from '@/lib/rateLimit';

export const dynamic = 'force-dynamic';

// POST /api/auth/verify-email
// ── FIX (Requirement #5) ────────────────────────────────────────────────
// The account only becomes usable here — after the OTP the person submits
// matches a still-valid PendingRegistration.
//
// STUDENT PROFILE-FIRST VALIDATION: for a Student, this does NOT insert a
// new User document. `pending.shadowStudentId` points at the SAME Student
// profile their Semester Admin already validated (Roll+Email+Group,
// registered: false) — this just fills in Name/Password/Mobile on that
// existing document and flips `registered` to true. So there's only ever
// one profile per student, from before they ever registered through to
// being a fully active account. Teacher/legacy flows (no shadow to update)
// still insert a fresh document, same as before.
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
      // email or studentId while this OTP was outstanding. A shadow
      // profile (registered: false) sharing the Email/Roll is expected —
      // it's what's about to be filled in — so it's excluded here, same
      // as in register-public.
      const emailTaken = await User.findOne({ email: pending.email, registered: { $ne: false } });
      if (emailTaken) {
        await PendingRegistration.findByIdAndDelete(pending._id);
        return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
      }
      if (pending.role === 'student' && pending.studentId) {
        const studentIdTaken = await User.findOne({ studentId: pending.studentId, registered: { $ne: false } });
        if (studentIdTaken) {
          await PendingRegistration.findByIdAndDelete(pending._id);
          return NextResponse.json({ success: false, message: 'This Student ID is already registered' }, { status: 400 });
        }
      }

      const now = new Date();
      // IMPORTANT: pending.password is already bcrypt-hashed (PendingRegistration
      // has its own pre-save hash hook). Updating via the native collection
      // (bypassing Mongoose's pre-save hook, same reasoning as before) avoids
      // hashing it a SECOND time — which would lock the person out of the
      // account they just verified.
      let updateResult = { matchedCount: 0 };
      if (pending.role === 'student' && pending.shadowStudentId) {
        updateResult = await User.collection.updateOne(
          { _id: pending.shadowStudentId, role: 'student', registered: false },
          {
            $set: {
              name: pending.name,
              password: pending.password,
              mobile: pending.mobile,
              departmentId: pending.departmentId,
              semester: pending.semester,
              section: pending.section,
              shift: pending.shift,
              isActive: true,
              isVerified: true,
              registered: true,
              updatedAt: now,
            },
            $unset: { regCode: '', regCodeExpire: '' },
          }
        );
      }

      let insertedId = pending.shadowStudentId;
      if (updateResult.matchedCount === 0) {
        // No shadow profile to update (Teacher/legacy flow, or the shadow
        // was somehow deleted in the meantime) — fall back to inserting a
        // fresh document, same as the original behavior.
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
          mobile: pending.mobile,
          isActive: true,
          isVerified: true,
          registered: true,
          verificationOTP: null,
          verificationExpire: null,
          resetPasswordOTP: null,
          resetPasswordExpire: null,
          createdAt: now,
          updatedAt: now,
        });
        insertedId = insertResult.insertedId;
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

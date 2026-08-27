import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import AdminInvite from '@/lib/models/AdminInvite';
import Subject from '@/lib/models/Subject';
import { errorResponse } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validatePassword';

export const dynamic = 'force-dynamic';

// POST /api/auth/admin-register
// Used by Sub Admin, Semester Admin, and Teacher to complete registration
// after receiving their 12-digit invite code by email. Email + Code +
// Password are required — every other field (name, department, shift,
// semester, subject, etc.) was already fixed by whoever sent the invite
// and is copied over here unchanged.
//
// MOBILE NUMBER (SUBSTITUTE CLASS FEATURE): a Teacher's mobile number is
// now REQUIRED at this step. Reason — if a Teacher misses a class, the
// Semester Admin needs to be able to actually call them (to confirm the
// class was missed and find out which students showed up) before
// starting a Substitute session on their behalf. Without a verified
// number on file, that phone call isn't possible. Sub Admin / Semester
// Admin registering here may still leave it blank (not required for
// those two roles).
export async function POST(request) {
  await dbConnect();
  try {
    const { email, code, password, mobile } = await request.json();
    if (!email || !code || !password) {
      return NextResponse.json({ success: false, message: 'Enter Email, Code and Password' }, { status: 400 });
    }
    const pwCheck = isStrongPassword(password);
    if (!pwCheck.ok) {
      return NextResponse.json({ success: false, message: pwCheck.message }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = code.trim().toUpperCase();

    const invite = await AdminInvite.findOne({
      email: normalizedEmail,
      code: normalizedCode,
      used: false,
      codeExpire: { $gt: new Date() },
    });
    if (!invite) {
      return NextResponse.json({ success: false, message: 'Wrong Code, or the Code has expired. Please ask your admin for a new invite.' }, { status: 400 });
    }

    // MOBILE NUMBER: mandatory specifically for Teacher accounts — see
    // comment above. Same 11-digit format already enforced for Student
    // self-registration (/api/auth/register-public), for consistency.
    if (invite.role === 'teacher') {
      if (!mobile || !mobile.trim()) {
        return NextResponse.json({ success: false, message: 'Mobile Number is required for Teacher accounts' }, { status: 400 });
      }
      if (!/^01[0-9]{9}$/.test(mobile.trim())) {
        return NextResponse.json({ success: false, message: 'Enter a valid 11-digit mobile number (e.g. 01XXXXXXXXX)' }, { status: 400 });
      }
    }

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      invite.used = true;
      invite.usedAt = new Date();
      await invite.save();
      return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
    }

    // Teacher invites also create the matching Subject document (this is
    // what the whole attendance/session system actually keys off of — see
    // Subject.teacherId), enforcing "one Subject = one Teacher" at the
    // same time.
    if (invite.role === 'teacher') {
      const existingSubject = await Subject.findOne({
        code: invite.subjectCode, departmentId: invite.departmentId,
        semester: invite.semester, section: invite.section, shift: invite.shift,
      });
      if (existingSubject && existingSubject.teacherId) {
        return NextResponse.json({ success: false, message: 'A Teacher is already assigned for this Subject' }, { status: 400 });
      }
    }

    const user = await User.create({
      name: invite.name,
      email: invite.email,
      password, // hashed by User's own pre-save hook
      role: invite.role,
      departmentId: invite.departmentId,
      departmentCode: invite.departmentCode,
      shift: invite.shift,
      semester: invite.semester,
      section: invite.section,
      mobile: mobile ? mobile.trim() : undefined,
      createdBy: invite.invitedBy,
      isActive: true,
      isVerified: true,
    });

    if (invite.role === 'teacher') {
      let subject = await Subject.findOne({
        code: invite.subjectCode, departmentId: invite.departmentId,
        semester: invite.semester, section: invite.section, shift: invite.shift,
      });
      if (subject) {
        subject.teacherId = user._id;
        subject.name = invite.subjectName || subject.name;
        await subject.save();
      } else {
        subject = await Subject.create({
          name: invite.subjectName, code: invite.subjectCode,
          departmentId: invite.departmentId, semester: invite.semester,
          section: invite.section, shift: invite.shift, teacherId: user._id,
        });
      }
      // MULTI-SUBJECT: user.subjectId is kept as a convenience pointer to
      // this Teacher's FIRST subject (used for identity display on their
      // dashboard) — it is no longer the source of truth for which
      // Subjects they teach. That's always Subject.find({ teacherId }),
      // since a Teacher can be assigned more Subjects later by any
      // Semester Admin via /api/semesterAdmin/teachers (existing-teacher
      // branch), which does NOT touch this field.
      user.subjectId = subject._id;
      await user.save();
    }

    invite.used = true;
    invite.usedAt = new Date();
    await invite.save();

    return NextResponse.json({ success: true, message: 'Registration successful! You can now log in.' }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

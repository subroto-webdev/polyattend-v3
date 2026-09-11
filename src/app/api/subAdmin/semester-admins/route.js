import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import AdminInvite from '@/lib/models/AdminInvite';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/subAdmin/semester-admins — Sub Admin: list Semester Admins
// (and pending invites) they created, scoped to their own Department+Shift.
export async function GET(request) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    // MULTI-SEMESTER ADMIN: one person's account can hold several
    // semesters now (see `semesters` on the User model), so sorting by a
    // single `semester` value no longer makes sense — sort by name instead.
    const semesterAdmins = await User.find({
      role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift,
    }).select('-password').populate('departmentId', 'name code').sort({ name: 1 }).lean();

    const pendingInvites = await AdminInvite.find({
      role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift,
      used: false, codeExpire: { $gt: new Date() },
    }).populate('departmentId', 'name code').sort({ semester: 1 }).lean();

    return NextResponse.json({ success: true, semesterAdmins, pendingInvites });
  } catch (error) { return errorResponse(error); }
}

// POST /api/subAdmin/semester-admins — Sub Admin: grant Semester Admin
// access for one of the 8 semesters within their own Department+Shift.
//
// MULTI-SEMESTER ADMIN: if `email` already belongs to an EXISTING
// Semester Admin account THIS Sub Admin created (same Department+Shift),
// this does NOT create a second account or send another registration
// email — it just adds the requested semester to that person's existing
// `semesters` array. They keep logging in with the same email/password
// and now see/manage both semesters. Only a genuinely new email goes
// through the invite-and-register flow (12-digit code emailed), same as
// before.
export async function POST(request) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    const { name, email, semester } = await request.json();

    if (!email || !semester) {
      return NextResponse.json({ success: false, message: 'Enter Email and Semester' }, { status: 400 });
    }
    const semesterNum = parseInt(semester);
    if (!Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return NextResponse.json({ success: false, message: 'Select a valid Semester (1-8)' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    // Department+Shift are always the Sub Admin's own — not caller-supplied
    // — so a Sub Admin can never grant access outside their scope.
    const departmentId = auth.user.departmentId;
    const departmentCode = auth.user.departmentCode;
    const shift = auth.user.shift;

    // One active Semester Admin per Department+Shift+Semester — this stays
    // true even with multiple semesters per person: `semesters: semesterNum`
    // matches any User whose array CONTAINS that semester, whoever they are.
    const existingSemAdminForSemester = await User.findOne({
      role: 'semesterAdmin', departmentId, shift, semesters: semesterNum, isActive: true,
    });

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // An account with this email exists somewhere. Only safe to reuse it
      // if it's a Semester Admin already under THIS Sub Admin's own scope
      // — otherwise (different role, or a different Department/Shift) this
      // must be treated as a real conflict, not silently merged.
      const isOwnScopeSemesterAdmin = existingUser.role === 'semesterAdmin'
        && String(existingUser.departmentId) === String(departmentId)
        && existingUser.shift === shift;

      if (!isOwnScopeSemesterAdmin) {
        return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
      }

      if (existingSemAdminForSemester) {
        const message = String(existingSemAdminForSemester._id) === String(existingUser._id)
          ? `${existingUser.name} already manages Semester ${semesterNum}`
          : `A Semester Admin (${existingSemAdminForSemester.name}) already exists for Semester ${semesterNum}`;
        return NextResponse.json({ success: false, message }, { status: 400 });
      }
      const existingInviteForSemester = await AdminInvite.findOne({
        role: 'semesterAdmin', departmentId, shift, semester: semesterNum, used: false, codeExpire: { $gt: new Date() },
      });
      if (existingInviteForSemester) {
        return NextResponse.json({ success: false, message: `An invite (${existingInviteForSemester.email}) is already pending for Semester ${semesterNum}` }, { status: 400 });
      }

      const current = new Set(existingUser.semesters || []);
      current.add(semesterNum);
      existingUser.semesters = Array.from(current).sort((a, b) => a - b);
      await existingUser.save();

      return NextResponse.json({
        success: true,
        addedToExisting: true,
        message: `Semester ${semesterNum} added to ${existingUser.name}'s existing account`,
        semesterAdmin: existingUser,
      }, { status: 200 });
    }

    // No existing account for this email — brand new person, normal
    // invite-and-register flow.
    if (!name) {
      return NextResponse.json({ success: false, message: 'Enter Name for the new Semester Admin' }, { status: 400 });
    }
    if (existingSemAdminForSemester) {
      return NextResponse.json({ success: false, message: `A Semester Admin (${existingSemAdminForSemester.name}) already exists for Semester ${semesterNum}` }, { status: 400 });
    }
    const existingInvite = await AdminInvite.findOne({ role: 'semesterAdmin', departmentId, shift, semester: semesterNum, used: false, codeExpire: { $gt: new Date() } });
    if (existingInvite) {
      return NextResponse.json({ success: false, message: `An invite (${existingInvite.email}) is already pending for Semester ${semesterNum}` }, { status: 400 });
    }

    const code = generateInviteCode();
    const codeExpire = oneMonthFromNow();

    const invite = await AdminInvite.create({
      role: 'semesterAdmin',
      name, email: normalizedEmail,
      departmentId, departmentCode, shift, semester: semesterNum,
      invitedBy: auth.user._id,
      code, codeExpire,
    });

    const { subject, message, html } = inviteCodeEmail({ name, role: 'semesterAdmin', code });
    try {
      await sendEmail({ email: normalizedEmail, subject, message, html });
    } catch (mailErr) {
      await AdminInvite.findByIdAndDelete(invite._id);
      throw mailErr;
    }

    return NextResponse.json({
      success: true,
      addedToExisting: false,
      message: `Registration code sent to ${name}'s email`,
      invite: { _id: invite._id, name: invite.name, email: invite.email, semester: semesterNum, codeExpire },
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

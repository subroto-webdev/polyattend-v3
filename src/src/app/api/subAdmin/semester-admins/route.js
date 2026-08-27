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
    const semesterAdmins = await User.find({
      role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift,
    }).select('-password').populate('departmentId', 'name code').sort({ semester: 1 }).lean();

    const pendingInvites = await AdminInvite.find({
      role: 'semesterAdmin', departmentId: auth.user.departmentId, shift: auth.user.shift,
      used: false, codeExpire: { $gt: new Date() },
    }).populate('departmentId', 'name code').sort({ semester: 1 }).lean();

    return NextResponse.json({ success: true, semesterAdmins, pendingInvites });
  } catch (error) { return errorResponse(error); }
}

// POST /api/subAdmin/semester-admins — Sub Admin: invite a new Semester
// Admin for one of the 8 semesters within their own Department+Shift.
export async function POST(request) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    const { name, email, semester } = await request.json();

    if (!name || !email || !semester) {
      return NextResponse.json({ success: false, message: 'Enter Name, Email and Semester' }, { status: 400 });
    }
    const semesterNum = parseInt(semester);
    if (!Number.isInteger(semesterNum) || semesterNum < 1 || semesterNum > 8) {
      return NextResponse.json({ success: false, message: 'Select a valid Semester (1-8)' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
    }

    // Department+Shift are always the Sub Admin's own — not caller-supplied
    // — so a Sub Admin can never create a Semester Admin outside their scope.
    const departmentId = auth.user.departmentId;
    const departmentCode = auth.user.departmentCode;
    const shift = auth.user.shift;

    // One active Semester Admin per Department+Shift+Semester.
    const existingSemAdmin = await User.findOne({ role: 'semesterAdmin', departmentId, shift, semester: semesterNum, isActive: true });
    if (existingSemAdmin) {
      return NextResponse.json({ success: false, message: `A Semester Admin (${existingSemAdmin.name}) already exists for Semester ${semesterNum}` }, { status: 400 });
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
      message: `Registration code sent to ${name}'s email`,
      invite: { _id: invite._id, name: invite.name, email: invite.email, semester: semesterNum, codeExpire },
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

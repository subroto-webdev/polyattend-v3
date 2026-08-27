import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import AdminInvite from '@/lib/models/AdminInvite';
import Department from '@/lib/models/Department';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/admin/sub-admins — Super Admin: list all Sub Admins (real
// accounts) + pending (not-yet-registered) invites, so the dashboard can
// show both in one place.
export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const subAdmins = await User.find({ role: 'subAdmin' })
      .select('-password')
      .populate('departmentId', 'name code')
      .sort({ createdAt: -1 });

    const pendingInvites = await AdminInvite.find({ role: 'subAdmin', used: false, codeExpire: { $gt: new Date() } })
      .populate('departmentId', 'name code')
      .sort({ createdAt: -1 });

    return NextResponse.json({ success: true, subAdmins, pendingInvites });
  } catch (error) { return errorResponse(error); }
}

// POST /api/admin/sub-admins — Super Admin: invite a new Sub Admin.
// Creates an AdminInvite (no real User yet) and emails a 12-digit code.
// The Sub Admin later completes registration at /admin-register with
// Email + Code + Password.
export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { name, email, departmentId, departmentCode, shift } = await request.json();

    if (!name || !email || !departmentId || !shift) {
      return NextResponse.json({ success: false, message: 'Enter Name, Email, Department and Shift' }, { status: 400 });
    }
    if (!['1st', '2nd'].includes(shift)) {
      return NextResponse.json({ success: false, message: 'Select a valid Shift' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existingUser = await User.findOne({ email: normalizedEmail });
    if (existingUser) {
      return NextResponse.json({ success: false, message: 'An account already exists with this email' }, { status: 400 });
    }

    const department = await Department.findById(departmentId);
    if (!department) {
      return NextResponse.json({ success: false, message: 'Department not found' }, { status: 404 });
    }

    // One active Sub Admin per Department+Shift combination — matches the
    // "one Sub Admin manages one Department+Shift" rule. An expired or
    // already-used invite doesn't block a new one.
    const existingSubAdmin = await User.findOne({ role: 'subAdmin', departmentId, shift, isActive: true });
    if (existingSubAdmin) {
      return NextResponse.json({ success: false, message: `A Sub Admin (${existingSubAdmin.name}) already exists for this Department (${department.code}) and Shift` }, { status: 400 });
    }
    const existingInvite = await AdminInvite.findOne({ role: 'subAdmin', departmentId, shift, used: false, codeExpire: { $gt: new Date() } });
    if (existingInvite) {
      return NextResponse.json({ success: false, message: `An invite (${existingInvite.email}) is already pending for this Department and Shift` }, { status: 400 });
    }

    const code = generateInviteCode();
    const codeExpire = oneMonthFromNow();

    const invite = await AdminInvite.create({
      role: 'subAdmin',
      name, email: normalizedEmail,
      departmentId, departmentCode: departmentCode || department.code, shift,
      invitedBy: auth.user._id,
      code, codeExpire,
    });

    const { subject, message, html } = inviteCodeEmail({ name, role: 'subAdmin', code });
    try {
      await sendEmail({ email: normalizedEmail, subject, message, html });
    } catch (mailErr) {
      await AdminInvite.findByIdAndDelete(invite._id);
      throw mailErr;
    }

    return NextResponse.json({
      success: true,
      message: `Registration code sent to ${name}'s email`,
      invite: { _id: invite._id, name: invite.name, email: invite.email, departmentId, shift, codeExpire },
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

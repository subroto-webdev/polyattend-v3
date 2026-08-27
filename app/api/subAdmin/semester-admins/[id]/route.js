import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import AdminInvite from '@/lib/models/AdminInvite';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// DELETE /api/subAdmin/semester-admins/[id] — Sub Admin: cancel a pending
// Semester Admin invite they sent (scoped to their own Department+Shift).
// The person hasn't registered yet, so there's no real User account to
// delete — this just removes the AdminInvite so the Semester slot is free
// again and the 12-digit code stops working.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['subAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const invite = await AdminInvite.findOne({
      _id: id, role: 'semesterAdmin',
      departmentId: auth.user.departmentId, shift: auth.user.shift,
    });
    if (!invite) {
      return NextResponse.json({ success: false, message: 'Invite not found' }, { status: 404 });
    }
    if (invite.used) {
      return NextResponse.json({ success: false, message: 'This invite has already been used, it cannot be cancelled' }, { status: 400 });
    }
    await AdminInvite.findByIdAndDelete(invite._id);
    return NextResponse.json({ success: true, message: 'Invite cancelled' });
  } catch (error) { return errorResponse(error); }
}

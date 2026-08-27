import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import AdminInvite from '@/lib/models/AdminInvite';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// DELETE /api/admin/sub-admins/[id] — Super Admin: cancel a pending Sub
// Admin invite (the person hasn't registered yet, so there's no real
// User account to delete — this just removes the AdminInvite so the
// Department+Shift is free again and the 12-digit code stops working).
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const invite = await AdminInvite.findOne({ _id: id, role: 'subAdmin' });
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

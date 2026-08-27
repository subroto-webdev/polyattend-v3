import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import AdminInvite from '@/lib/models/AdminInvite';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// DELETE /api/semesterAdmin/teachers/[id] — Semester Admin: cancel a
// pending Teacher invite they sent (scoped to their own
// Department+Shift+Semester). The person hasn't registered yet, so
// there's no real User account to delete — this just removes the
// AdminInvite so the same email/Subject/Group can be invited again and
// the old 12-digit code stops working.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const invite = await AdminInvite.findOne({
      _id: id, role: 'teacher',
      departmentId: auth.user.departmentId, shift: auth.user.shift, semester: auth.user.semester,
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

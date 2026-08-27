import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/sessions/:id
export async function GET(request, { params }) {
  // SECURITY FIX: exposed a session's full attendance list (every student's
  // name/ID/status) to any authenticated user, including students outside
  // that class. Restrict to teacher/admin/subAdmin/semesterAdmin, scoped
  // appropriately below.
  const auth = await requireAuth(request, ['teacher', 'admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const session = await Session.findById(id)
      .populate('teacherId', 'name').populate('departmentId', 'name code').populate('subjectId', 'name code');
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && session.teacherId?._id?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'This is not your session' }, { status: 403 });
    }
    if (auth.user.role === 'subAdmin' && (session.departmentId?._id?.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift)) {
      return NextResponse.json({ success: false, message: 'This session is outside your scope' }, { status: 403 });
    }
    if (auth.user.role === 'semesterAdmin' && (session.departmentId?._id?.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift || session.semester !== auth.user.semester)) {
      return NextResponse.json({ success: false, message: 'This session is outside your scope' }, { status: 403 });
    }

    // PERFORMANCE: read-only, serialized straight to JSON — .lean() skips
    // Mongoose document hydration for the whole attendance list.
    const attendance = await Attendance.find({ sessionId: session._id }).populate('studentId', 'name studentId section').lean();
    return NextResponse.json({ success: true, session, attendance });
  } catch (error) { return errorResponse(error); }
}

// DELETE /api/sessions/:id - Permanently delete a session and its attendance
// records. Teachers may only delete their own sessions; Sub Admin/Semester
// Admin may delete sessions within their own scope; Super Admin may delete
// any. An active (not-yet-ended) session must be ended first, so a session
// currently taking attendance can't be pulled out from under a teacher or a
// student mid-class.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const session = await Session.findById(id);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && session.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'This is not your session' }, { status: 403 });
    }
    if (auth.user.role === 'subAdmin' && (session.departmentId?.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift)) {
      return NextResponse.json({ success: false, message: 'This session is outside your scope' }, { status: 403 });
    }
    if (auth.user.role === 'semesterAdmin' && (session.departmentId?.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift || session.semester !== auth.user.semester)) {
      return NextResponse.json({ success: false, message: 'This session is outside your scope' }, { status: 403 });
    }
    if (session.status === 'active') {
      return NextResponse.json({ success: false, message: 'End the Session first before deleting an active session' }, { status: 400 });
    }

    await Attendance.deleteMany({ sessionId: session._id });
    await Session.findByIdAndDelete(session._id);

    return NextResponse.json({ success: true, message: 'Session and its attendance have been deleted' });
  } catch (error) { return errorResponse(error); }
}

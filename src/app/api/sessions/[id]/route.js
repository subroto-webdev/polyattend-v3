import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/sessions/:id
export async function GET(request, { params }) {
  // SECURITY FIX: exposed a session's full attendance list (every student's
  // name/ID/status) to any authenticated user, including students outside
  // that class. Restrict to teacher/admin, and to the owning teacher.
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const session = await Session.findById(params.id)
      .populate('teacherId', 'name').populate('departmentId', 'name code').populate('subjectId', 'name code');
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && session.teacherId?._id?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'এটা আপনার session নয়' }, { status: 403 });
    }

    const attendance = await Attendance.find({ sessionId: session._id }).populate('studentId', 'name studentId section');
    return NextResponse.json({ success: true, session, attendance });
  } catch (error) { return errorResponse(error); }
}

// DELETE /api/sessions/:id - Permanently delete a session and its attendance
// records. Teachers may only delete their own sessions; admins may delete
// any. An active (not-yet-ended) session must be ended first, so a session
// currently taking attendance can't be pulled out from under a teacher or a
// student mid-class.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const session = await Session.findById(params.id);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && session.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'এটা আপনার session নয়' }, { status: 403 });
    }
    if (session.status === 'active') {
      return NextResponse.json({ success: false, message: 'Active session delete করার আগে আগে Session End করুন' }, { status: 400 });
    }

    await Attendance.deleteMany({ sessionId: session._id });
    await Session.findByIdAndDelete(session._id);

    return NextResponse.json({ success: true, message: 'Session ও তার attendance মুছে ফেলা হয়েছে' });
  } catch (error) { return errorResponse(error); }
}
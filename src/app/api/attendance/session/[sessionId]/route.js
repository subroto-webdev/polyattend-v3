import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/attendance/session/:sessionId
export async function GET(request, { params }) {
  // SECURITY FIX: previously any authenticated user (including a student)
  // could pull the full attendance list — every student's name/ID/status —
  // for any session just by knowing its ID. Restrict to teacher/admin, and
  // to the owning teacher specifically.
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { sessionId } = await params;
    const session = await Session.findById(sessionId);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });

    const isOwnerTeacher = session.teacherId?.toString() === auth.user._id.toString();
    if (auth.user.role === 'teacher' && !isOwnerTeacher) {
      return NextResponse.json({ success: false, message: 'This is not your session' }, { status: 403 });
    }

    // FIX: `.sort({ 'studentId.name': 1 })` here never actually worked —
    // Mongoose's `.sort()` runs as part of the database query, but
    // `.populate()` only fills in `studentId` AFTER that query returns.
    // At sort time `studentId` is still just an ObjectId with no `.name`
    // to sort by, so MongoDB silently ignored it and returned attendance
    // rows in whatever order they happened to be stored — not by name.
    // Sorting on the already-populated result (after `.lean()`) instead
    // actually sorts by the student's name, as intended.
    const attendance = await Attendance.find({ sessionId })
      .populate('studentId', 'name studentId section shift')
      .lean();
    attendance.sort((a, b) => (a.studentId?.name || '').localeCompare(b.studentId?.name || ''));
    return NextResponse.json({ success: true, count: attendance.length, attendance });
  } catch (error) { return errorResponse(error); }
}

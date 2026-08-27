import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/attendance/active-session
// Student-only. Returns the currently active session (if any) that matches
// this student's department/semester/section (and shift, if set), plus
// whether the student has already self-marked present for it.
// The student dashboard polls this route so the "Mark My Attendance" card
// can appear automatically the moment a teacher starts a session.
export async function GET(request) {
  const auth = await requireAuth(request, ['student']);
  if (auth.error) return auth.error;
  try {
    const student = auth.user;
    if (!student.departmentId || student.semester == null || !student.section) {
      return NextResponse.json({ success: true, session: null, alreadyMarked: false });
    }

    const filter = {
      status: 'active',
      departmentId: student.departmentId,
      semester: student.semester,
      section: student.section,
    };
    if (student.shift) filter.shift = student.shift;

    const session = await Session.findOne(filter)
      .populate('subjectId', 'name code')
      .populate('teacherId', 'name')
      .sort({ startTime: -1 });

    if (!session) {
      return NextResponse.json({ success: true, session: null, alreadyMarked: false });
    }

    const existing = await Attendance.findOne({ sessionId: session._id, studentId: student._id });
    const alreadyMarked = !!existing && existing.status === 'present';

    return NextResponse.json({
      success: true,
      session,
      alreadyMarked,
      markedBy: existing?.markedBy || null,
    });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// POST /api/semesterAdmin/promote
// Body: { studentIds: [...] }
// Moves the selected Students from this Semester Admin's own semester to
// semester + 1 within the same Department+Shift. Every registered
// Student in this Semester Admin's scope is eligible; any student NOT
// included in `studentIds` simply stays at the current semester (this is
// how a drop-out is handled — they're just left unselected, no separate
// "mark as dropped" action needed).
//
// A Bangladesh polytechnic runs 8 semesters — promoting a semester-8
// student is a graduation, not a move to a semester 9 that doesn't
// exist, so that case is rejected with a clear message rather than
// silently corrupting the semester field.
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { studentIds } = await request.json();
    if (!Array.isArray(studentIds) || studentIds.length === 0) {
      return NextResponse.json({ success: false, message: 'Select at least one Student' }, { status: 400 });
    }

    const currentSemester = auth.user.semester;
    if (currentSemester >= 8) {
      return NextResponse.json({ success: false, message: 'Cannot promote from Semester 8 — this is the final (graduating) semester' }, { status: 400 });
    }
    const nextSemester = currentSemester + 1;

    // SCOPE ENFORCEMENT: only actually promote students that genuinely
    // belong to this Semester Admin's own Department+Shift+Semester —
    // silently ignores any id outside that scope rather than trusting
    // the caller's list wholesale.
    const result = await User.updateMany(
      {
        _id: { $in: studentIds },
        role: 'student',
        departmentId: auth.user.departmentId,
        shift: auth.user.shift,
        semester: currentSemester,
      },
      { $set: { semester: nextSemester } }
    );

    return NextResponse.json({
      success: true,
      message: `${result.modifiedCount} Student(s) promoted to Semester ${nextSemester}`,
      promotedCount: result.modifiedCount,
    });
  } catch (error) { return errorResponse(error); }
}

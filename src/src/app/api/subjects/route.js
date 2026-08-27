import { NextResponse } from 'next/server';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('departmentId');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const teacherId = searchParams.get('teacherId');

    const filter = { isActive: true };
    if (departmentId) filter.departmentId = departmentId;
    if (semester) filter.semester = parseInt(semester);
    if (section) filter.section = section;
    if (teacherId) filter.teacherId = teacherId;

    if (auth.user.role === 'student') {
      filter.departmentId = auth.user.departmentId;
      filter.semester = auth.user.semester;
      filter.section = auth.user.section;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'teacher') {
      // MULTI-SUBJECT: a Teacher can now be assigned to Subjects across
      // different Semesters (and even different Shifts), not just their
      // own account-level `shift`/`semester` fields — those fields are
      // still set from the Teacher's FIRST assignment (for identity
      // display) but are no longer the source of truth for which
      // Subjects they teach. teacherId match alone is the correct scope.
      filter.teacherId = auth.user._id;
    }
    // SCOPE ENFORCEMENT: Sub Admin/Semester Admin only ever see subjects
    // within their own Department+Shift(+Semester) — same rule as /api/users.
    if (auth.user.role === 'subAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'semesterAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
      filter.semester = auth.user.semester;
    }

    const subjects = await Subject.find(filter)
      .populate('departmentId', 'name code')
      .populate('teacherId', 'name email')
      .sort({ semester: 1, name: 1 })
      .lean();
    return NextResponse.json({ success: true, subjects });
  } catch (error) { return errorResponse(error); }
}

// MISTAKE FIX: Teachers could previously create their own Subject here
// directly (the "My Subjects" page, now removed). That conflicted with
// the current rule — a Teacher account and its one Subject are created
// together, only by a Semester Admin, via /api/semesterAdmin/teachers.
// This endpoint is now admin-only (Super Admin), kept for management/
// correction use, not for a Teacher to self-serve a new Subject.
export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const { name, code, departmentId, semester, section, shift, teacherId } = body;
    if (!name || !code || !departmentId || !semester || !section || !shift) {
      return NextResponse.json({ success: false, message: 'All fields required' }, { status: 400 });
    }

    const existing = await Subject.findOne({ code, departmentId, semester: parseInt(semester), section, shift });
    if (existing) return NextResponse.json({ success: false, message: 'Subject code already exists for this class' }, { status: 400 });

    const subject = await Subject.create({ name, code, departmentId, semester: parseInt(semester), section, shift, teacherId });
    const populated = await Subject.findById(subject._id).populate('departmentId', 'name code').populate('teacherId', 'name email');
    return NextResponse.json({ success: true, subject: populated }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

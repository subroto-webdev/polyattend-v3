import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';

export const dynamic = 'force-dynamic';

// POST /api/sessions - Teacher starts a session. Super Admin keeps its
// original unrestricted ability (any subject, any department).
//
// MISSED-DATE CATCH-UP (backdated): a Teacher retaking/covering their OWN
// missed class (from their Dashboard or the Covered Miss Class page) can
// pass an explicit `date` (YYYY-MM-DD). The resulting Session — and
// therefore all Attendance records saved against it — is stamped with
// THAT date, not the date they happen to be sitting down to enter it. A
// live "right now" session (no `date` passed) keeps using today, same as
// always.
export async function POST(request) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const subjectId = body?.subjectId;
    const semester = body?.semester;
    const section = body?.section;
    const explicitDateParam = body?.date; // 'YYYY-MM-DD' — Teacher (own missed class) only

    if (!subjectId || semester == null || !section) {
      return NextResponse.json({ success: false, message: 'Subject, semester and section are required' }, { status: 400 });
    }

    // A backdated session date is only ever honored for the Teacher
    // retaking their own missed class — every other caller always gets
    // "now", exactly as before.
    let sessionDate = null;
    if (explicitDateParam && auth.user.role === 'teacher') {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(explicitDateParam)) {
        return NextResponse.json({ success: false, message: 'Invalid date format' }, { status: 400 });
      }
      sessionDate = new Date(`${explicitDateParam}T00:00:00`);
      const today = new Date();
      const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate());
      if (sessionDate > todayStart) {
        return NextResponse.json({ success: false, message: 'Cannot start a session for a future date' }, { status: 400 });
      }
    }
    const checkAgainstDate = sessionDate || new Date();

    // MISTAKE FIX: Holiday declarations previously had no effect anywhere —
    // an admin could mark a day off but sessions still started normally.
    // Also, only Friday was auto-excluded; Saturday (also a normal college
    // off-day here) was not. Both are now enforced at the point a session
    // actually gets created — against the session's own date (today for a
    // live session, or the backdated date for a Missed Sessions catch-up).
    const holidayResult = await checkHoliday(checkAgainstDate);
    if (holidayResult.isHoliday) {
      const reasonText = holidayResult.reason === 'Friday' ? 'That day is Friday'
        : holidayResult.reason === 'Saturday' ? 'That day is Saturday'
        : `That day is a holiday (${holidayResult.holiday?.title || 'Declared Holiday'})`;
      return NextResponse.json({ success: false, message: `${reasonText} — College is closed, so a Session cannot be started.` }, { status: 403 });
    }

    // Resolve department/shift from the Subject document itself (source of truth),
    // instead of the departmentId the client sent — that value could be null
    // whenever the subject's populated departmentId was unavailable on the
    // frontend, which used to crash later reads of the resulting session.
    let subject;
    if (auth.user.role === 'teacher') {
      subject = await Subject.findOne({ _id: subjectId, teacherId: auth.user._id, isActive: true });
      if (!subject) return NextResponse.json({ success: false, message: 'You are not assigned to this subject' }, { status: 403 });
    } else {
      subject = await Subject.findById(subjectId);
      if (!subject) return NextResponse.json({ success: false, message: 'Subject not found' }, { status: 404 });
    }

    const departmentId = subject.departmentId;
    if (!departmentId) {
      return NextResponse.json({ success: false, message: 'This subject has no valid Department. Edit the Subject and set the Department again.' }, { status: 400 });
    }
    const subjectShift = subject.shift;

    const existing = await Session.findOne({ subjectId, semester, section, status: 'active' });
    if (existing) {
      return NextResponse.json({ success: false, message: 'An active session already exists for this class', session: existing }, { status: 400 });
    }

    // For a backdated Missed-Sessions catch-up: refuse if that date is no
    // longer actually missing (e.g. someone else already covered it, or
    // the Teacher's own record for it surfaces later) — a Session already
    // exists for that Subject on that exact date, of any status.
    if (sessionDate) {
      const dayStart = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate());
      const dayEnd = new Date(sessionDate.getFullYear(), sessionDate.getMonth(), sessionDate.getDate(), 23, 59, 59, 999);
      const existingForDate = await Session.findOne({ subjectId, date: { $gte: dayStart, $lte: dayEnd } });
      if (existingForDate) {
        return NextResponse.json({ success: false, message: 'This date is no longer marked missed — a Session already exists for it' }, { status: 400 });
      }
    }

    const shiftFilter = { role: 'student', departmentId, semester: parseInt(semester), section, isActive: true };
    if (subjectShift) shiftFilter.shift = subjectShift;

    const totalStudents = await User.countDocuments(shiftFilter);

    const sessionPayload = {
      teacherId: auth.user._id,
      departmentId, subjectId,
      semester: parseInt(semester), section, shift: subjectShift, totalStudents,
    };
    // Only set `date` explicitly for a backdated catch-up — otherwise leave
    // it unset so the schema's own `default: Date.now` applies.
    if (sessionDate) sessionPayload.date = sessionDate;

    const session = await Session.create(sessionPayload);

    const populated = await Session.findById(session._id)
      .populate('teacherId', 'name').populate('departmentId', 'name code').populate('subjectId', 'name code');

    // NOTE: previously this sent a "class started" email to every student
    // the moment a session began. Removed per request — sending an email to
    // the whole class on every single session start was too noisy. Only the
    // "you missed a class" email (sent when a session ends, for whoever
    // ended up absent — see /api/sessions/[id]/end) stays.

    return NextResponse.json({ success: true, session: populated }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

// GET /api/sessions - Get sessions (role-based)
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const departmentId = searchParams.get('departmentId');
    const subjectId = searchParams.get('subjectId');
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    const status = searchParams.get('status');

    const filter = {};
    if (auth.user.role === 'teacher') filter.teacherId = auth.user._id;
    if (departmentId) filter.departmentId = departmentId;
    if (subjectId) filter.subjectId = subjectId;
    if (semester) filter.semester = parseInt(semester);
    if (section) filter.section = section;
    if (status) filter.status = status;
    // SCOPE ENFORCEMENT: Sub Admin/Semester Admin only ever see sessions
    // within their own Department+Shift(+Semester) — same rule used
    // everywhere else in this hierarchy.
    if (auth.user.role === 'subAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
    }
    if (auth.user.role === 'semesterAdmin') {
      filter.departmentId = auth.user.departmentId;
      filter.shift = auth.user.shift;
      filter.semester = auth.user.semester;
    }

    const sessions = await Session.find(filter)
      .populate('teacherId', 'name').populate('departmentId', 'name code').populate('subjectId', 'name code')
      .sort({ createdAt: -1 }).limit(100);

    return NextResponse.json({ success: true, count: sessions.length, sessions });
  } catch (error) { return errorResponse(error); }
}

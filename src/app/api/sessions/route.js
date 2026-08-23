import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';

export const dynamic = 'force-dynamic';

// POST /api/sessions - Teacher starts a session
export async function POST(request) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const subjectId = body?.subjectId;
    const semester = body?.semester;
    const section = body?.section;

    if (!subjectId || semester == null || !section) {
      return NextResponse.json({ success: false, message: 'Subject, semester and section are required' }, { status: 400 });
    }

    // MISTAKE FIX: Holiday declarations previously had no effect anywhere —
    // an admin could mark a day off but sessions still started normally.
    // Also, only Friday was auto-excluded; Saturday (also a normal college
    // off-day here) was not. Both are now enforced at the point a session
    // actually gets created.
    const holidayResult = await checkHoliday(new Date());
    if (holidayResult.isHoliday) {
      const reasonText = holidayResult.reason === 'Friday' ? 'Today is Friday'
        : holidayResult.reason === 'Saturday' ? 'Today is Saturday'
        : `Today is a holiday (${holidayResult.holiday?.title || 'Declared Holiday'})`;
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

    const shiftFilter = { role: 'student', departmentId, semester: parseInt(semester), section, isActive: true };
    if (subjectShift) shiftFilter.shift = subjectShift;

    const totalStudents = await User.countDocuments(shiftFilter);

    const session = await Session.create({
      teacherId: auth.user._id, departmentId, subjectId,
      semester: parseInt(semester), section, shift: subjectShift, totalStudents,
    });

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

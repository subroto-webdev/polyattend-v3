import { NextResponse } from 'next/server';
import Subject from '@/lib/models/Subject';
import Session from '@/lib/models/Session';
import Holiday from '@/lib/models/Holiday';
import IgnoredMiss from '@/lib/models/IgnoredMiss';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// Missed Classes are only ever looked back a fixed 7-day rolling window —
// NOT since a Subject was created. Older gaps simply age out of this list
// (they still exist in history via the Teacher Session Report, per-day —
// this endpoint is specifically the short-term "still actionable" list).
const LOOKBACK_DAYS = 7;

// GET /api/reports/missed-sessions?asOfDate=YYYY-MM-DD&includeToday=true|false
// Available to Teacher (own Subjects only), Semester Admin (own
// Department+Shift+Semester), Sub Admin (own Department+Shift), and Super
// Admin (everything, optionally narrowed by departmentId/shift/semester
// query params).
//
// Returns every (Subject, date) working day in the last 7 days for which
// no Session was ever created AND which hasn't been explicitly dismissed
// (see DELETE below) — a class missed weeks ago no longer shows here once
// it ages past the 7-day window.
//
// `asOfDate` / `includeToday` are supplied by the CLIENT (browser-local
// time in Dhaka), not computed on the server, so this correctly reflects
// "has it passed 7:00 PM there yet" regardless of what timezone the
// server itself runs in:
//   - includeToday=false -> today is excluded from the scan entirely
//     (a class scheduled for later today hasn't been "missed" yet)
//   - includeToday=true  -> today is included (it's evening — any class
//     that was going to happen today already has, or hasn't)
export async function GET(request) {
  const auth = await requireAuth(request, ['teacher', 'semesterAdmin', 'subAdmin', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const asOfParam = searchParams.get('asOfDate');
    const includeToday = searchParams.get('includeToday') === 'true';

    const asOfDate = asOfParam ? new Date(`${asOfParam}T00:00:00`) : new Date();
    const cutoff = new Date(asOfDate.getFullYear(), asOfDate.getMonth(), asOfDate.getDate());
    if (!includeToday) cutoff.setDate(cutoff.getDate() - 1);
    cutoff.setHours(23, 59, 59, 999);

    const rangeStart = new Date(cutoff);
    rangeStart.setDate(rangeStart.getDate() - (LOOKBACK_DAYS - 1));
    rangeStart.setHours(0, 0, 0, 0);

    if (rangeStart > cutoff) {
      return NextResponse.json({ success: true, missed: [] });
    }

    // SCOPE ENFORCEMENT — same rule used everywhere else in this hierarchy.
    const subjectFilter = { isActive: true, teacherId: { $ne: null } };
    if (auth.user.role === 'teacher') {
      subjectFilter.teacherId = auth.user._id;
    } else if (auth.user.role === 'semesterAdmin') {
      subjectFilter.departmentId = auth.user.departmentId;
      subjectFilter.shift = auth.user.shift;
      subjectFilter.semester = auth.user.semester;
    } else if (auth.user.role === 'subAdmin') {
      subjectFilter.departmentId = auth.user.departmentId;
      subjectFilter.shift = auth.user.shift;
    } else {
      // admin (Super Admin) — unrestricted, optionally narrowed
      const departmentId = searchParams.get('departmentId');
      const shift = searchParams.get('shift');
      const semester = searchParams.get('semester');
      if (departmentId) subjectFilter.departmentId = departmentId;
      if (shift) subjectFilter.shift = shift;
      if (semester) subjectFilter.semester = parseInt(semester);
    }

    const subjects = await Subject.find(subjectFilter)
      .populate('teacherId', 'name email mobile')
      .populate('departmentId', 'name code')
      .lean();

    if (subjects.length === 0) {
      return NextResponse.json({ success: true, missed: [] });
    }

    const subjectIds = subjects.map(s => s._id);
    const [allSessions, allHolidays, allIgnored] = await Promise.all([
      Session.find({
        subjectId: { $in: subjectIds },
        date: { $gte: rangeStart, $lte: cutoff },
      }).select('subjectId date').lean(),
      Holiday.find({ startDate: { $lte: cutoff }, endDate: { $gte: rangeStart } }).select('startDate endDate').lean(),
      IgnoredMiss.find({
        subjectId: { $in: subjectIds },
        date: { $gte: rangeStart, $lte: cutoff },
      }).select('subjectId date').lean(),
    ]);

    const dateKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const heldSet = new Set(allSessions.map(s => `${s.subjectId.toString()}_${dateKey(new Date(s.date))}`));
    const ignoredSet = new Set(allIgnored.map(s => `${s.subjectId.toString()}_${dateKey(new Date(s.date))}`));

    const isNonWorkingDay = (d) => {
      const day = d.getDay(); // 5 = Friday, 6 = Saturday
      if (day === 5 || day === 6) return true;
      return allHolidays.some(h => new Date(h.startDate) <= d && new Date(h.endDate) >= d);
    };

    const missed = [];
    for (const subject of subjects) {
      const created = new Date(subject.createdAt);
      const subjectStart = new Date(Math.max(
        rangeStart.getTime(),
        new Date(created.getFullYear(), created.getMonth(), created.getDate()).getTime()
      ));
      for (let d = new Date(subjectStart); d <= cutoff; d.setDate(d.getDate() + 1)) {
        if (isNonWorkingDay(d)) continue;
        const key = `${subject._id.toString()}_${dateKey(d)}`;
        if (heldSet.has(key) || ignoredSet.has(key)) continue;
        missed.push({
          subjectId: subject._id.toString(),
          subjectName: subject.name,
          subjectCode: subject.code,
          departmentCode: subject.departmentId?.code,
          semester: subject.semester,
          section: subject.section,
          teacherId: subject.teacherId?._id,
          teacherName: subject.teacherId?.name || '—',
          teacherMobile: subject.teacherId?.mobile || null,
          date: dateKey(d),
        });
      }
    }

    // Newest missed date first, so the most recent (most actionable) gaps
    // surface at the top of the list.
    missed.sort((a, b) => b.date.localeCompare(a.date) || a.subjectName.localeCompare(b.subjectName));

    return NextResponse.json({ success: true, missed });
  } catch (error) { return errorResponse(error); }
}

// DELETE /api/reports/missed-sessions?subjectId=...&date=YYYY-MM-DD&reason=...
// Teacher ONLY dismisses a Missed Classes entry (their own Subject) WITHOUT
// covering it — no Session/Attendance is created, this just stops that
// (Subject, date) pair from being reported as an outstanding miss (see
// IgnoredMiss model, and the GET handler above which excludes anything
// ignored here). This lives alongside the Covered Miss Class page, where a
// Teacher can instead retake/cover the class (see POST /api/sessions `date`
// field) if they'd rather record it than wave it away.
export async function DELETE(request) {
  const auth = await requireAuth(request, ['teacher']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const dateParam = searchParams.get('date');
    const reason = searchParams.get('reason') || '';

    if (!subjectId || !dateParam) {
      return NextResponse.json({ success: false, message: 'subjectId and date are required' }, { status: 400 });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      return NextResponse.json({ success: false, message: 'Invalid date format' }, { status: 400 });
    }

    // Same scope rule as everywhere else — a Teacher may only dismiss a
    // missed entry for their own assigned Subject.
    const subject = await Subject.findById(subjectId);
    if (!subject) return NextResponse.json({ success: false, message: 'Subject not found' }, { status: 404 });
    if (subject.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'This subject is outside your scope' }, { status: 403 });
    }

    const date = new Date(`${dateParam}T00:00:00`);

    // If a real Session already exists for that date, it's not "missed"
    // anymore — nothing to dismiss (avoids confusing a real Substitute
    // Covered / Held day with a dismissed one).
    const dayStart = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const dayEnd = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
    const existingSession = await Session.findOne({ subjectId, date: { $gte: dayStart, $lte: dayEnd } });
    if (existingSession) {
      return NextResponse.json({ success: false, message: 'This date already has a Session — it is not a missed entry anymore' }, { status: 400 });
    }

    await IgnoredMiss.findOneAndUpdate(
      { subjectId, date: dayStart },
      { subjectId, date: dayStart, ignoredBy: auth.user._id, reason: reason.trim() || undefined },
      { upsert: true, setDefaultsOnInsert: true }
    );

    return NextResponse.json({ success: true, message: 'Missed entry dismissed' });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import Subject from '@/lib/models/Subject';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';

export const dynamic = 'force-dynamic';

// GET /api/reports/teacher-session?date=YYYY-MM-DD
// For Super Admin (all departments), Sub Admin (own Department+Shift), and
// Semester Admin (own Department+Shift+Semester): for every active
// Subject (= one Teacher), report whether that Teacher held at least one
// Session on the given date. Friday/Saturday and declared Holidays are
// reported as an off-day instead of individual per-teacher rows, since no
// class was expected that day.
//
// SUBSTITUTE CLASS: a Session held that day may have been started by a
// Semester Admin covering for the assigned Teacher (Session.isSubstitute).
// That still counts as "held" (the class actually happened, attendance was
// taken), but is reported separately as "Substitute Covered" so an admin
// can tell it apart from the Teacher personally taking their own class.
//
// Also includes each Teacher's mobile number so a Semester Admin reviewing
// a "Miss" can call that Teacher directly, e.g. from the Missed Sessions
// panel (6PM–12AM) — visible to whichever admin role is viewing this report.
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const dateParam = searchParams.get('date') || new Date().toISOString();
    const checkDate = new Date(dateParam);

    const holidayResult = await checkHoliday(checkDate);
    if (holidayResult.isHoliday) {
      return NextResponse.json({
        success: true, isHoliday: true, reason: holidayResult.reason,
        holiday: holidayResult.holiday, rows: [],
      });
    }

    const dayStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 0, 0, 0);
    const dayEnd = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 23, 59, 59, 999);

    const subjectFilter = { isActive: true, teacherId: { $ne: null } };
    // SCOPE ENFORCEMENT: Sub Admin only sees their own Department+Shift;
    // Semester Admin only their own Department+Shift+Semester; Super Admin
    // sees everything (optionally narrowed by query params).
    if (auth.user.role === 'subAdmin') {
      subjectFilter.departmentId = auth.user.departmentId;
      subjectFilter.shift = auth.user.shift;
    } else if (auth.user.role === 'semesterAdmin') {
      subjectFilter.departmentId = auth.user.departmentId;
      subjectFilter.shift = auth.user.shift;
      subjectFilter.semester = auth.user.semester;
    } else {
      const departmentId = searchParams.get('departmentId');
      const shift = searchParams.get('shift');
      if (departmentId) subjectFilter.departmentId = departmentId;
      if (shift) subjectFilter.shift = shift;
    }

    const subjects = await Subject.find(subjectFilter)
      .populate('departmentId', 'name code')
      .populate('teacherId', 'name email mobile')
      .sort({ departmentId: 1, semester: 1, section: 1 });

    const sessionsToday = await Session.find({
      subjectId: { $in: subjects.map(s => s._id) },
      date: { $gte: dayStart, $lte: dayEnd },
    }).select('subjectId status isSubstitute substituteBy').populate('substituteBy', 'name');

    const sessionBySubjectId = new Map();
    sessionsToday.forEach(s => sessionBySubjectId.set(s.subjectId.toString(), s));

    const rows = subjects.map(s => {
      const heldSession = sessionBySubjectId.get(s._id.toString());
      return {
        subjectId: s._id,
        subjectName: s.name,
        subjectCode: s.code,
        teacherId: s.teacherId?._id,
        teacherName: s.teacherId?.name || '—',
        teacherEmail: s.teacherId?.email,
        teacherMobile: s.teacherId?.mobile || null,
        departmentCode: s.departmentId?.code,
        semester: s.semester,
        section: s.section,
        shift: s.shift,
        held: !!heldSession,
        isSubstitute: !!heldSession?.isSubstitute,
        substituteByName: heldSession?.substituteBy?.name || null,
      };
    });

    return NextResponse.json({
      success: true, isHoliday: false, rows,
      summary: {
        total: rows.length,
        held: rows.filter(r => r.held).length,
        missed: rows.filter(r => !r.held).length,
        substitute: rows.filter(r => r.isSubstitute).length,
      },
    });
  } catch (error) { return errorResponse(error); }
}

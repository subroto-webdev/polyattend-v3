import { NextResponse } from 'next/server';
import Subject from '@/lib/models/Subject';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';

export const dynamic = 'force-dynamic';

// GET /api/reports/teacher-session?date=YYYY-MM-DD
// For Super Admin (all departments) and Sub Admin (own Department+Shift):
// for every active Subject (= one Teacher), report whether that Teacher
// held at least one Session on the given date. Friday/Saturday and
// declared Holidays are reported as an off-day instead of individual
// per-teacher rows, since no class was expected that day.
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin']);
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
    // Super Admin sees everything (optionally narrowed by query params).
    if (auth.user.role === 'subAdmin') {
      subjectFilter.departmentId = auth.user.departmentId;
      subjectFilter.shift = auth.user.shift;
    } else {
      const departmentId = searchParams.get('departmentId');
      const shift = searchParams.get('shift');
      if (departmentId) subjectFilter.departmentId = departmentId;
      if (shift) subjectFilter.shift = shift;
    }

    const subjects = await Subject.find(subjectFilter)
      .populate('departmentId', 'name code')
      .populate('teacherId', 'name email')
      .sort({ departmentId: 1, semester: 1, section: 1 });

    const sessionsToday = await Session.find({
      subjectId: { $in: subjects.map(s => s._id) },
      date: { $gte: dayStart, $lte: dayEnd },
    }).select('subjectId status');

    const heldSubjectIds = new Set(sessionsToday.map(s => s.subjectId.toString()));

    const rows = subjects.map(s => ({
      subjectId: s._id,
      subjectName: s.name,
      subjectCode: s.code,
      teacherId: s.teacherId?._id,
      teacherName: s.teacherId?.name || '—',
      teacherEmail: s.teacherId?.email,
      departmentCode: s.departmentId?.code,
      semester: s.semester,
      section: s.section,
      shift: s.shift,
      held: heldSubjectIds.has(s._id.toString()),
    }));

    return NextResponse.json({
      success: true, isHoliday: false, rows,
      summary: { total: rows.length, held: rows.filter(r => r.held).length, missed: rows.filter(r => !r.held).length },
    });
  } catch (error) { return errorResponse(error); }
}

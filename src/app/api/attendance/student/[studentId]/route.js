import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/attendance/student/:studentId
export async function GET(request, { params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { studentId } = await params;
    const student = await User.findById(studentId);
    if (!student) return NextResponse.json({ success: false, message: 'Student not found' }, { status: 404 });
    if (auth.user.role === 'student' && auth.user._id.toString() !== studentId) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const subjectId = searchParams.get('subjectId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');

    const filter = { studentId };
    if (subjectId) filter.subjectId = subjectId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const records = await Attendance.find(filter)
      .populate('subjectId', 'name code')
      .populate('sessionId', 'date startTime')
      .sort({ date: -1 })
      .lean();

    const bySubject = {};
    records.forEach(r => {
      const sid = r.subjectId?._id?.toString();
      if (!sid) return;
      if (!bySubject[sid]) bySubject[sid] = { subject: r.subjectId, total: 0, present: 0, absent: 0, records: [] };
      bySubject[sid].total++;
      bySubject[sid][r.status]++;
      bySubject[sid].records.push(r);
    });

    const summary = Object.values(bySubject).map(s => ({
      ...s, percentage: s.total ? Math.round((s.present / s.total) * 100) : 0,
    }));

    const overallTotal = records.length;
    const overallPresent = records.filter(r => r.status === 'present').length;

    return NextResponse.json({
      success: true,
      student: { name: student.name, studentId: student.studentId },
      summary,
      overall: {
        total: overallTotal, present: overallPresent, absent: overallTotal - overallPresent,
        percentage: overallTotal ? Math.round((overallPresent / overallTotal) * 100) : 0,
      },
    });
  } catch (error) { return errorResponse(error); }
}

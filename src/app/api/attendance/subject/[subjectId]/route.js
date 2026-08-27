import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import Session from '@/lib/models/Session';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/attendance/subject/:subjectId
export async function GET(request, { params }) {
  // SECURITY FIX: this returned the full class roster + every student's
  // attendance history for a subject to ANY authenticated user, including
  // students who aren't even in that class. Restrict to teacher/admin —
  // students use /api/attendance/student/:studentId for their own view.
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { subjectId } = await params;
    const subject = await Subject.findById(subjectId);
    if (!subject) return NextResponse.json({ success: false, message: 'Subject not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && subject.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'Not your subject' }, { status: 403 });
    }

    const sessions = await Session.find({ subjectId, status: 'ended' }).sort({ date: -1 }).lean();

    const studentFilter = {
      role: 'student', departmentId: subject.departmentId, semester: subject.semester,
      section: subject.section, isActive: true,
    };
    if (subject.shift) studentFilter.shift = subject.shift;

    const students = await User.find(studentFilter).sort({ name: 1 }).lean();
    const allAttendance = await Attendance.find({ subjectId }).lean();

    const attMap = {};
    allAttendance.forEach(a => {
      const sid = a.studentId.toString();
      const sessid = a.sessionId.toString();
      if (!attMap[sid]) attMap[sid] = {};
      attMap[sid][sessid] = a.status;
    });

    const report = students.map(s => {
      const sid = s._id.toString();
      const records = attMap[sid] || {};
      const total = sessions.length;
      const present = sessions.filter(sess => records[sess._id.toString()] === 'present').length;
      return {
        student: { _id: s._id, name: s.name, studentId: s.studentId },
        total, present, absent: total - present,
        percentage: total ? Math.round((present / total) * 100) : 0,
        sessions: sessions.map(sess => ({
          sessionId: sess._id, date: sess.date, status: records[sess._id.toString()] || 'absent',
        })),
      };
    });

    return NextResponse.json({ success: true, subject, sessions, report });
  } catch (error) { return errorResponse(error); }
}

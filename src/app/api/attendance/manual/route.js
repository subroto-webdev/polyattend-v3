import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

function classNameFromSession(session) {
  if (!session || session.semester == null || session.section == null || session.section === '') {
    return 'Class unknown';
  }
  return `Class ${session.semester}-${session.section}`;
}

// POST /api/attendance/manual - Teacher takes manual attendance for full class
export async function POST(request) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const sessionId = body?.sessionId;
    const attendanceList = Array.isArray(body?.attendanceList) ? body.attendanceList : null;

    if (!sessionId || !attendanceList) {
      return NextResponse.json({ success: false, message: 'sessionId and attendanceList are required' }, { status: 400 });
    }

    const session = await Session.findById(sessionId);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (session.status !== 'active') return NextResponse.json({ success: false, message: 'Session not active' }, { status: 400 });
    if (!session.teacherId || (session.teacherId.toString() !== auth.user._id.toString() && auth.user.role !== 'admin')) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }
    if (!session.departmentId || !session.subjectId) {
      return NextResponse.json({ success: false, message: 'Subject/Department data is incomplete for this session. Cancel the Session and start again.' }, { status: 400 });
    }

    const className = classNameFromSession(session);
    const validItems = attendanceList.filter(item => item && item.studentId);
    if (validItems.length === 0) {
      return NextResponse.json({ success: false, message: 'No valid student found' }, { status: 400 });
    }

    const ops = validItems.map(item => ({
      updateOne: {
        filter: { sessionId, studentId: item.studentId },
        update: {
          $set: {
            sessionId, studentId: item.studentId, subjectId: session.subjectId,
            departmentId: session.departmentId, semester: session.semester,
            section: session.section, className, date: session.date,
            status: item.status === 'present' ? 'present' : 'absent', markedBy: 'manual',
          },
        },
        upsert: true,
        setDefaultsOnInsert: false,
      },
    }));

    await Attendance.bulkWrite(ops);
    const presentCount = validItems.filter(a => a.status === 'present').length;
    await Session.findByIdAndUpdate(sessionId, { presentCount });

    return NextResponse.json({ success: true, message: 'Attendance saved', presentCount });
  } catch (error) { return errorResponse(error); }
}

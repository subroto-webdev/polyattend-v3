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

// Shared ownership check, reused by manual-attendance and session-end:
// - the real assigned Teacher who owns the session, OR
// - Super Admin (unrestricted).
function canOperateOnSession(session, authUser) {
  if (authUser.role === 'admin') return true;
  if (session.teacherId?.toString() === authUser._id.toString()) return true;
  return false;
}

// POST /api/attendance/manual - Teacher takes manual attendance for a class
// (including catching up on their own missed classes via Covered Miss Class)
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
    if (!canOperateOnSession(session, auth.user)) {
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

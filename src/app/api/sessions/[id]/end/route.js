import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT /api/sessions/:id/end - Teacher ends a session
//
// CHANGED (per request): this route now ONLY marks the session as ended.
// It no longer touches Attendance at all — no auto-filling absent records
// for students missing a record, and no "class missed" email notifications.
// If a student has no Attendance record for this session when it ends,
// they simply have no record (not present, not absent). Saving attendance
// is entirely the responsibility of /api/attendance/manual (Save button)
// and the student self-check-in routes, called BEFORE this endpoint.
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const session = await Session.findById(id);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (session.teacherId.toString() !== auth.user._id.toString() && auth.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }
    if (session.status === 'ended') {
      return NextResponse.json({ success: false, message: 'Session already ended' }, { status: 400 });
    }

    session.status = 'ended';
    session.endTime = new Date();
    await session.save();

    return NextResponse.json({ success: true, message: 'Session ended', session });
  } catch (error) { return errorResponse(error); }
}
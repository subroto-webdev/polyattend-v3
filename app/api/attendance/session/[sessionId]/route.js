import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/attendance/session/:sessionId
export async function GET(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { sessionId } = await params;
    const session = await Session.findById(sessionId);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });

    const isOwnerTeacher = session.teacherId?.toString() === auth.user._id.toString();
    if (auth.user.role === 'teacher' && !isOwnerTeacher) {
      return NextResponse.json({ success: false, message: 'This is not your session' }, { status: 403 });
    }

    // FIX: .sort({ 'studentId.name': 1 }) কাজ করে না কারণ MongoDB sort
    // populate()-এর আগে হয় — তখন studentId শুধু ObjectId, .name নেই।
    // তাই .lean() দিয়ে plain object বানিয়ে JS-এ sort করা হচ্ছে।
    const attendance = await Attendance.find({ sessionId })
      .populate('studentId', 'name studentId section shift')
      .lean();

    attendance.sort((a, b) =>
      (a.studentId?.name || '').localeCompare(b.studentId?.name || '')
    );

    return NextResponse.json({ success: true, count: attendance.length, attendance });
  } catch (error) { return errorResponse(error); }
}

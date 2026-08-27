import { NextResponse } from 'next/server';
import Session from '@/lib/models/Session';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT /api/sessions/:id/attendance - Manual attendance update
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { attendanceUpdates } = await request.json();
    const session = await Session.findById(id);
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (session.teacherId.toString() !== auth.user._id.toString() && auth.user.role !== 'admin') {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }

    // FIX: আগে for...of loop-এ প্রতিটা update-এর জন্য আলাদা DB call হতো।
    // ৩০ জন student হলে = ৩০টা sequential query।
    // bulkWrite() দিয়ে সব update একটাই DB round-trip-এ শেষ।
    if (attendanceUpdates?.length > 0) {
      await Attendance.bulkWrite(
        attendanceUpdates.map(u => ({
          updateOne: {
            filter: { _id: u.attendanceId },
            update: { $set: { status: u.status } },
          },
        }))
      );
    }

    const presentCount = await Attendance.countDocuments({ sessionId: session._id, status: 'present' });
    await Session.findByIdAndUpdate(session._id, { presentCount });

    return NextResponse.json({ success: true, message: 'Attendance updated' });
  } catch (error) { return errorResponse(error); }
}

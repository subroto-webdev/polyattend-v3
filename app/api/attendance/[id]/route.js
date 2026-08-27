import { NextResponse } from 'next/server';
import Attendance from '@/lib/models/Attendance';
import Session from '@/lib/models/Session';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// PUT /api/attendance/:id
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const { status } = await request.json();
    const attendance = await Attendance.findByIdAndUpdate(id, { status }, { new: true })
      .populate('studentId', 'name studentId');
    if (!attendance) return NextResponse.json({ success: false, message: 'Record not found' }, { status: 404 });

    const presentCount = await Attendance.countDocuments({ sessionId: attendance.sessionId, status: 'present' });
    await Session.findByIdAndUpdate(attendance.sessionId, { presentCount });

    return NextResponse.json({ success: true, attendance });
  } catch (error) { return errorResponse(error); }
}

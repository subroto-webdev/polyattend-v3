import { NextResponse } from 'next/server';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const subject = await Subject.findById(id);
    if (!subject) return NextResponse.json({ success: false, message: 'Subject not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && subject.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'Not your subject' }, { status: 403 });
    }
    const body = await request.json();
    const updated = await Subject.findByIdAndUpdate(id, body, { new: true })
      .populate('departmentId', 'name code').populate('teacherId', 'name email');
    return NextResponse.json({ success: true, subject: updated });
  } catch (error) { return errorResponse(error, 400); }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const subject = await Subject.findById(id);
    if (!subject) return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
    if (auth.user.role === 'teacher' && subject.teacherId?.toString() !== auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'Not your subject' }, { status: 403 });
    }
    await Subject.findByIdAndUpdate(id, { isActive: false });
    return NextResponse.json({ success: true, message: 'Subject deleted' });
  } catch (error) { return errorResponse(error); }
}

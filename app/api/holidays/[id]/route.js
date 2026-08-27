import { NextResponse } from 'next/server';
import Holiday from '@/lib/models/Holiday';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const holiday = await Holiday.findByIdAndUpdate(id, body, { new: true });
    return NextResponse.json({ success: true, holiday });
  } catch (error) { return errorResponse(error, 400); }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    await Holiday.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Holiday deleted' });
  } catch (error) { return errorResponse(error); }
}

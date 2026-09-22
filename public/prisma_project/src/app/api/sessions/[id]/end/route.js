import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['teacher', 'admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const session = await prisma.session.findUnique({ where: { id } });
    if (!session) return NextResponse.json({ success: false, message: 'Session not found' }, { status: 404 });
    if (auth.user.role !== 'admin' && session.teacherId !== auth.user.id) return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    if (session.status === 'ended') return NextResponse.json({ success: false, message: 'Session already ended' }, { status: 400 });
    const updated = await prisma.session.update({ where: { id }, data: { status: 'ended', endTime: new Date() } });
    return NextResponse.json({ success: true, message: 'Session ended', session: updated });
  } catch (error) { return errorResponse(error); }
}

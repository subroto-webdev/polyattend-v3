import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const holiday = await prisma.holiday.update({ where: { id }, data: { title: body.title, startDate: body.startDate ? new Date(body.startDate) : undefined, endDate: body.endDate ? new Date(body.endDate) : undefined, type: body.type, recurring: body.recurring, description: body.description } });
    return NextResponse.json({ success: true, holiday });
  } catch (error) { return errorResponse(error, 400); }
}
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    await prisma.holiday.delete({ where: { id } });
    return NextResponse.json({ success: true, message: 'Holiday deleted' });
  } catch (error) { return errorResponse(error); }
}

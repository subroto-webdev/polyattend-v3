import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const holidays = await prisma.holiday.findMany({ orderBy: { startDate: 'asc' } });
    return NextResponse.json({ success: true, holidays });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const holiday = await prisma.holiday.create({ data: { title: body.title, startDate: new Date(body.startDate), endDate: new Date(body.endDate), type: body.type || 'other', recurring: body.recurring ?? false, description: body.description || null } });
    return NextResponse.json({ success: true, holiday }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

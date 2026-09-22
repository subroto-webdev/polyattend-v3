import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const settings = await prisma.settings.findFirst({ where: { key: 'global' } });
    return NextResponse.json({ success: true, settings: settings || { attendanceThreshold: 70 } });
  } catch (error) { return errorResponse(error); }
}
export async function PUT(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { attendanceThreshold } = await request.json();
    const settings = await prisma.settings.upsert({ where: { key: 'global' }, update: { attendanceThreshold }, create: { key: 'global', attendanceThreshold } });
    return NextResponse.json({ success: true, settings });
  } catch (error) { return errorResponse(error); }
}

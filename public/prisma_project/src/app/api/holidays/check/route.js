import { NextResponse } from 'next/server';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const date = searchParams.get('date') || new Date().toISOString();
    const result = await checkHoliday(date);
    return NextResponse.json({ success: true, ...result });
  } catch (error) { return errorResponse(error); }
}

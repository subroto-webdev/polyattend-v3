import { NextResponse } from 'next/server';
import { requireAuth, errorResponse } from '@/lib/auth';
import { checkHoliday } from '@/lib/holidayCheck';

export const dynamic = 'force-dynamic';

// GET /api/holidays/check?date=YYYY-MM-DD
// Returns whether the given date is a college off-day: Friday, Saturday,
// or a manually declared Holiday range. Used to block session creation on
// off-days and to exclude off-days from the Teacher Session Report.
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

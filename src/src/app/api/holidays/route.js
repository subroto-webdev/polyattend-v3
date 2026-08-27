import { NextResponse } from 'next/server';
import Holiday from '@/lib/models/Holiday';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const holidays = await Holiday.find().sort({ startDate: 1 });
    return NextResponse.json({ success: true, holidays });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const holiday = await Holiday.create(body);
    return NextResponse.json({ success: true, holiday }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

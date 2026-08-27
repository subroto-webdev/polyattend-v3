import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Department from '@/lib/models/Department';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const departments = await Department.find({ isActive: true }).sort('name');
    return NextResponse.json({ success: true, departments });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const dept = await Department.create(body);
    return NextResponse.json({ success: true, department: dept }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

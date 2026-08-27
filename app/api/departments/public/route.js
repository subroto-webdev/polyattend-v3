import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Department from '@/lib/models/Department';
import { errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function GET() {
  await dbConnect();
  try {
    const departments = await Department.find({ isActive: true }).select('name code description').sort('name');
    return NextResponse.json({ success: true, departments });
  } catch (error) { return errorResponse(error); }
}

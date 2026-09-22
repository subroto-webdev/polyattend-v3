import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const departments = await prisma.department.findMany({ where: { isActive: true }, select: { id: true, name: true, code: true, description: true }, orderBy: { name: 'asc' } });
    return NextResponse.json({ success: true, departments });
  } catch (error) { return errorResponse(error); }
}

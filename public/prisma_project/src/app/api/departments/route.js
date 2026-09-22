import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const departments = await prisma.department.findMany({ orderBy: { name: 'asc' } });
    return NextResponse.json({ success: true, departments });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const body = await request.json();
    const dept = await prisma.department.create({ data: { name: body.name, code: body.code?.toUpperCase(), technologyCode: body.technologyCode || body.technology_code || '', description: body.description || null } });
    return NextResponse.json({ success: true, department: dept }, { status: 201 });
  } catch (error) { return errorResponse(error, 400); }
}

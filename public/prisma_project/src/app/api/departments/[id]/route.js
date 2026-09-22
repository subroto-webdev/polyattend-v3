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
    const dept = await prisma.department.update({ where: { id }, data: { name: body.name, code: body.code?.toUpperCase(), technologyCode: body.technologyCode || body.technology_code, description: body.description, isActive: body.isActive } });
    return NextResponse.json({ success: true, department: dept });
  } catch (error) { return errorResponse(error, 400); }
}
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    await prisma.department.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) { return errorResponse(error); }
}

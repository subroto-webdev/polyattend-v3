import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, hashPassword, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const body = await request.json();
    const data = { ...body };
    if (data.password) data.password = await hashPassword(data.password);
    const user = await prisma.user.update({ where: { id }, data, select: { id: true, name: true, email: true, role: true, isActive: true } });
    return NextResponse.json({ success: true, user });
  } catch (error) { return errorResponse(error, 400); }
}
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: 'User deactivated' });
  } catch (error) { return errorResponse(error); }
}

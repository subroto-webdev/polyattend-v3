import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const role = searchParams.get('role');
    if (!q) return NextResponse.json({ success: false, message: 'q is required' }, { status: 400 });
    const users = await prisma.user.findMany({ where: { role: role || 'teacher', isActive: true, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] }, select: { id: true, name: true, email: true, role: true, departmentId: true, shift: true }, take: 10 });
    return NextResponse.json({ success: true, users });
  } catch (error) { return errorResponse(error); }
}

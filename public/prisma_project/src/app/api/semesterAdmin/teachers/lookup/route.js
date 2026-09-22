import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin','admin','subAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const q = searchParams.get('q')?.trim();
    const semester = searchParams.get('semester');
    const section = searchParams.get('section');
    if (!q) return NextResponse.json({ success: false, message: 'q is required' }, { status: 400 });
    const teachers = await prisma.user.findMany({
      where: { role: 'teacher', isActive: true, departmentId: auth.user.role !== 'admin' ? auth.user.departmentId : undefined, shift: auth.user.role !== 'admin' ? auth.user.shift : undefined, OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }] },
      select: { id:true, name:true, email:true, mobile:true, taughtSubjects: { select: { id:true, name:true, code:true, semester:true, section:true } } },
      take: 10
    });
    return NextResponse.json({ success: true, teachers });
  } catch (error) { return errorResponse(error); }
}

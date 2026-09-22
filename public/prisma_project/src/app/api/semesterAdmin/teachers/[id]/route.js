import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin','admin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const invite = await prisma.adminInvite.findUnique({ where: { id } });
    if (invite) { await prisma.adminInvite.delete({ where: { id } }); return NextResponse.json({ success: true, message: 'Invite cancelled' }); }
    const teacher = await prisma.user.findUnique({ where: { id } });
    if (!teacher) return NextResponse.json({ success: false, message: 'Teacher not found' }, { status: 404 });
    if (auth.user.role !== 'admin' && (teacher.departmentId !== auth.user.departmentId || teacher.shift !== auth.user.shift))
      return NextResponse.json({ success: false, message: 'Outside your scope' }, { status: 403 });
    await prisma.user.update({ where: { id }, data: { isActive: false } });
    return NextResponse.json({ success: true, message: 'Teacher deactivated' });
  } catch (error) { return errorResponse(error); }
}

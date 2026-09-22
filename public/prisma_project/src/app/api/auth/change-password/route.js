import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { requireAuth, hashPassword, comparePassword, errorResponse } from '@/lib/auth';
import { isStrongPassword } from '@/lib/validatePassword';
export const dynamic = 'force-dynamic';
export async function PUT(request) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { currentPassword, newPassword } = await request.json();
    const pwCheck = isStrongPassword(newPassword);
    if (!pwCheck.ok) return NextResponse.json({ success: false, message: pwCheck.message }, { status: 400 });
    const user = await prisma.user.findUnique({ where: { id: auth.user.id } });
    if (!(await comparePassword(currentPassword, user.password || '')))
      return NextResponse.json({ success: false, message: 'Current password is incorrect' }, { status: 400 });
    await prisma.user.update({ where: { id: auth.user.id }, data: { password: await hashPassword(newPassword) } });
    return NextResponse.json({ success: true, message: 'Password changed successfully' });
  } catch (error) { return errorResponse(error); }
}

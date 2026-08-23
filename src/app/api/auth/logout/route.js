import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// POST /api/auth/logout
// HttpOnly cookie JavaScript দিয়ে মুছা যায় না, তাই server থেকেই clear করতে হয়।
export async function POST() {
  const response = NextResponse.json({ success: true, message: 'Logged out' });
  response.cookies.set('token', '', {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 0,
    path: '/',
  });
  return response;
}

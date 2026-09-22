import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import { errorResponse } from '@/lib/auth';
export const dynamic = 'force-dynamic';
export async function POST(request) {
  try {
    const { name, email, message } = await request.json();
    if (!name || !email || !message) return NextResponse.json({ success: false, message: 'All fields required' }, { status: 400 });
    const feedback = await prisma.feedback.create({ data: { name, email: email.toLowerCase(), message } });
    return NextResponse.json({ success: true, feedback }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

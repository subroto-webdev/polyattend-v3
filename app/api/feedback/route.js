import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import Feedback from '@/lib/models/Feedback';
import sendEmail from '@/lib/sendEmail';
import { errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

export async function POST(request) {
  await dbConnect();
  try {
    const { name, email, message } = await request.json();
    if (!name || !email || !message) {
      return NextResponse.json({ success: false, message: 'Please fill in all fields' }, { status: 400 });
    }

    await Feedback.create({ name, email, message });

    await sendEmail({
      email: process.env.SMTP_USER,
      subject: `PolyAttend Feedback — ${name}`,
      message: `Name: ${name}\nEmail: ${email}\n\nMessage:\n${message}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px;">
          <h2 style="color: #1a6b4a;">New Feedback — PolyAttend</h2>
          <p><strong>Name:</strong> ${name}</p>
          <p><strong>Email:</strong> ${email}</p>
          <hr style="border: 0; border-top: 1px solid #e2e8f0; margin: 16px 0;" />
          <p><strong>Message:</strong></p>
          <p style="background: #f8fafc; padding: 12px; border-radius: 8px;">${message}</p>
        </div>`,
    });

    return NextResponse.json({ success: true, message: 'Feedback submitted successfully! Thank you.' }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

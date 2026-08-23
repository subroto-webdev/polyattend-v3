import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/semesterAdmin/teachers/lookup?email=...
// Used by the "Assign Subject" form as the Semester Admin types an email:
// tells the frontend whether this email already belongs to a Teacher, so
// the UI can switch from "invite a new Teacher" (needs Name + sends a
// registration code) to "assign another Subject to this existing Teacher"
// (no new email/code — just the new Subject) before the admin submits,
// rather than surprising them with a different outcome after the fact.
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const email = (searchParams.get('email') || '').toLowerCase().trim();
    if (!email) return NextResponse.json({ success: false, message: 'Enter Email' }, { status: 400 });

    const user = await User.findOne({ email }).select('name email role isActive');
    if (!user) return NextResponse.json({ success: true, found: false });

    if (user.role !== 'teacher') {
      return NextResponse.json({ success: true, found: true, isTeacher: false, name: user.name, role: user.role });
    }

    const subjects = await Subject.find({ teacherId: user._id })
      .populate('departmentId', 'name code')
      .select('name code section semester shift departmentId')
      .sort({ semester: 1 });

    return NextResponse.json({
      success: true, found: true, isTeacher: true,
      teacher: { _id: user._id, name: user.name, email: user.email, isActive: user.isActive },
      subjects,
    });
  } catch (error) { return errorResponse(error); }
}

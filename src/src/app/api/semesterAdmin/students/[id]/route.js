import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import StudentPreApproval from '@/lib/models/StudentPreApproval';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// DELETE /api/semesterAdmin/students/:id
// Removes a Student Validation entry. Two cases:
//   - Not yet registered (used: false): just deletes the pre-approval —
//     that Roll+Email can now be re-added / re-approved fresh.
//   - Already registered (used: true): the actual Student User account
//     also gets permanently deleted (matches the "type the name to
//     confirm" delete used everywhere else in the app), since leaving a
//     used-up pre-approval with no matching account behind would be
//     confusing and orphaned.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const entry = await StudentPreApproval.findById(id);
    if (!entry) return NextResponse.json({ success: false, message: 'Data not found' }, { status: 404 });

    // SCOPE ENFORCEMENT: only the Semester Admin's own Department+Shift+Semester.
    const inScope = String(entry.departmentId) === String(auth.user.departmentId)
      && entry.shift === auth.user.shift
      && entry.semester === auth.user.semester;
    if (!inScope) return NextResponse.json({ success: false, message: 'You cannot delete data outside your scope' }, { status: 403 });

    if (entry.used && entry.usedByUserId) {
      const student = await User.findById(entry.usedByUserId);
      if (student) {
        const { confirmName } = await request.json().catch(() => ({}));
        if (!confirmName || confirmName.trim() !== student.name.trim()) {
          return NextResponse.json({ success: false, message: 'Name does not match — type the exact name and try again' }, { status: 400 });
        }
        await User.findByIdAndDelete(student._id);
      }
    }

    await StudentPreApproval.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) { return errorResponse(error); }
}

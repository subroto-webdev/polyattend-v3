import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// DELETE /api/semesterAdmin/students/:id
// Removes a Student Validation entry — this IS the Student User document
// now (see User.registered), so this just deletes it directly. Two cases:
//   - Not yet registered (registered: false): a lightweight delete is
//     enough — nothing else references this profile yet, and that
//     Roll+Email can now be re-added / re-validated fresh.
//   - Already registered (registered: true): requires the same
//     "type the name to confirm" step used everywhere else in the app
//     before deleting an active account, since attendance history etc.
//     may be attached to it.
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const student = await User.findById(id);
    if (!student || student.role !== 'student') {
      return NextResponse.json({ success: false, message: 'Data not found' }, { status: 404 });
    }

    // SCOPE ENFORCEMENT: only the Semester Admin's own Department+Shift, for
    // whichever Semester this entry actually belongs to.
    const inScope = String(student.departmentId) === String(auth.user.departmentId)
      && student.shift === auth.user.shift
      && (auth.user.semesters || []).includes(student.semester);
    if (!inScope) return NextResponse.json({ success: false, message: 'You cannot delete data outside your scope' }, { status: 403 });

    if (student.registered !== false) {
      const { confirmName } = await request.json().catch(() => ({}));
      if (!confirmName || confirmName.trim() !== (student.name || '').trim()) {
        return NextResponse.json({ success: false, message: 'Name does not match — type the exact name and try again' }, { status: 400 });
      }
    }

    await User.findByIdAndDelete(id);
    return NextResponse.json({ success: true, message: 'Deleted' });
  } catch (error) { return errorResponse(error); }
}

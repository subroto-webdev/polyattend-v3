import { NextResponse } from 'next/server';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/users/:id
export async function GET(request, { params }) {
  // SECURITY FIX: had no role restriction at all, so any authenticated
  // student could fetch any other user's full profile (name, email,
  // department, etc.) just by ID. Allow admin/teacher freely, and allow a
  // user to fetch their own record, but block a student from reading
  // someone else's profile this way.
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    if (auth.user.role === 'student' && auth.user._id.toString() !== id) {
      return NextResponse.json({ success: false, message: 'Not authorized' }, { status: 403 });
    }
    const user = await User.findById(id).select('-password').populate('departmentId', 'name code');
    if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, user });
  } catch (error) { return errorResponse(error); }
}

// PUT /api/users/:id
export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const target = await User.findById(id);
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

    // SCOPE ENFORCEMENT: same rule as DELETE below — a Sub Admin can only
    // edit (e.g. toggle active/inactive) users within their own
    // Department+Shift; a Semester Admin only within their own
    // Department+Shift+Semester.
    if (auth.user.role === 'subAdmin') {
      const inScope = ['semesterAdmin', 'teacher', 'student'].includes(target.role)
        && String(target.departmentId) === String(auth.user.departmentId)
        && target.shift === auth.user.shift;
      if (!inScope) return NextResponse.json({ success: false, message: 'You cannot edit a user outside your scope' }, { status: 403 });
    }
    if (auth.user.role === 'semesterAdmin') {
      const inScope = ['teacher', 'student'].includes(target.role)
        && String(target.departmentId) === String(auth.user.departmentId)
        && target.shift === auth.user.shift
        && (auth.user.semesters || []).includes(target.semester);
      if (!inScope) return NextResponse.json({ success: false, message: 'You cannot edit a user outside your scope' }, { status: 403 });
    }

    // MISTAKE FIX: this previously destructured `phone`, but the User
    // model's field is `mobile` — so any admin edit attempting to update
    // a phone number silently did nothing. Also now allows editing the
    // new hierarchy scope fields (shift, departmentCode, subjectId) so
    // Edit works for Sub Admin / Semester Admin / Teacher records too.
    const { name, email, mobile, departmentId, departmentCode, shift, semester, section, subjectId, isActive } = await request.json();
    const update = { name, email, mobile, departmentId, departmentCode, shift, semester, section, subjectId, isActive };
    // Only apply fields that were actually provided, so a partial edit
    // (e.g. just isActive) doesn't null out everything else.
    Object.keys(update).forEach(k => update[k] === undefined && delete update[k]);

    const user = await User.findByIdAndUpdate(
      id,
      update,
      { new: true, runValidators: true }
    ).select('-password').populate('departmentId', 'name code');
    if (!user) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });
    return NextResponse.json({ success: true, user });
  } catch (error) { return errorResponse(error); }
}

// DELETE /api/users/:id
// BEHAVIOR CHANGE (per request): this used to just set isActive:false —
// now it permanently removes the User document. Because this is
// irreversible, the caller must pass `confirmName` matching the target
// user's exact name (the frontend enforces "type the name to confirm";
// this is the server-side half of that safeguard, since a client check
// alone can be bypassed).
export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { id } = await params;
    const target = await User.findById(id);
    if (!target) return NextResponse.json({ success: false, message: 'User not found' }, { status: 404 });

    if (target._id.toString() === auth.user._id.toString()) {
      return NextResponse.json({ success: false, message: 'You cannot delete your own account' }, { status: 400 });
    }

    // SCOPE ENFORCEMENT: a Sub Admin may only delete a Semester Admin or
    // Teacher or Student within their own Department+Shift; a Semester
    // Admin only within their own Department+Shift+Semester. Mirrors the
    // same scoping already enforced when listing users in GET /api/users.
    if (auth.user.role === 'subAdmin') {
      const inScope = ['semesterAdmin', 'teacher', 'student'].includes(target.role)
        && String(target.departmentId) === String(auth.user.departmentId)
        && target.shift === auth.user.shift;
      if (!inScope) return NextResponse.json({ success: false, message: 'You cannot delete a user outside your scope' }, { status: 403 });
    }
    if (auth.user.role === 'semesterAdmin') {
      const inScope = ['teacher', 'student'].includes(target.role)
        && String(target.departmentId) === String(auth.user.departmentId)
        && target.shift === auth.user.shift
        && (auth.user.semesters || []).includes(target.semester);
      if (!inScope) return NextResponse.json({ success: false, message: 'You cannot delete a user outside your scope' }, { status: 403 });
    }

    const { confirmName } = await request.json().catch(() => ({}));
    if (!confirmName || confirmName.trim() !== target.name.trim()) {
      return NextResponse.json({ success: false, message: 'Name does not match — type the exact name and try again' }, { status: 400 });
    }

    await User.findByIdAndDelete(id);

    // CASCADE FIX: a Subject with no living Teacher can't have attendance
    // taken for it, so it shouldn't still count as "active" anywhere —
    // but nothing was clearing Subject.teacherId (or deactivating the
    // Subject) when its Teacher got deleted here. That left a Subject
    // pointing at a User that no longer exists, which `populate()` just
    // silently returns as null for — showing up as "—" / "No mobile on
    // file" in the Missed Classes Report (and anywhere else that reads
    // subject.teacherId.name) instead of disappearing like a properly
    // retired Subject should. Soft-delete it the same way the Subject's
    // own DELETE endpoint does (isActive: false), so it's excluded
    // everywhere `isActive: true` is already filtered on.
    if (target.role === 'teacher') {
      await Subject.updateMany({ teacherId: target._id }, { isActive: false });
    }

    return NextResponse.json({ success: true, message: `${target.name} has been permanently deleted` });
  } catch (error) { return errorResponse(error); }
}

import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import Subject from '@/lib/models/Subject';
import AdminInvite from '@/lib/models/AdminInvite';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';

export const dynamic = 'force-dynamic';

// GET /api/semesterAdmin/teachers — Semester Admin: list Teachers (and
// pending invites) who have at least one Subject within their own
// Department+Shift, across EVERY Semester this admin has been granted
// (see User.semesters) — not just one.
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const allowedSemesters = auth.user.semesters || [];
    const scopeSubjects = await Subject.find({
      departmentId: auth.user.departmentId, shift: auth.user.shift, semester: { $in: allowedSemesters },
      teacherId: { $ne: null },
    }).populate('teacherId', 'name email mobile isActive role').populate('departmentId', 'name code').select('teacherId name code section semester departmentId').lean();

    // Group by teacher so each Teacher shows once, with the list of
    // Subjects they teach specifically within this Semester Admin's scope.
    const byTeacher = new Map();
    for (const s of scopeSubjects) {
      if (!s.teacherId) continue;
      const tId = s.teacherId._id.toString();
      if (!byTeacher.has(tId)) {
        byTeacher.set(tId, { ...s.teacherId, departmentId: s.departmentId, subjects: [] });
      }
      byTeacher.get(tId).subjects.push({ _id: s._id, name: s.name, code: s.code, section: s.section, semester: s.semester });
    }
    const teachers = Array.from(byTeacher.values()).sort((a, b) => a.name.localeCompare(b.name));

    const pendingInvites = await AdminInvite.find({
      role: 'teacher', departmentId: auth.user.departmentId,
      shift: auth.user.shift, semester: { $in: allowedSemesters },
      used: false, codeExpire: { $gt: new Date() },
    }).sort({ semester: 1, section: 1 }).lean();

    return NextResponse.json({ success: true, teachers, pendingInvites });
  } catch (error) { return errorResponse(error); }
}

// POST /api/semesterAdmin/teachers — Semester Admin: assign a Subject +
// Group, for ONE of this admin's own granted Semesters, to a Teacher.
//
// MULTI-SEMESTER ADMIN: `semester` is now required in the request body —
// with multiple Semesters granted, there's no longer a single implicit
// one to assume. It's validated against this admin's own `semesters`
// array so they still can't act outside their granted scope. When this
// admin only has ONE granted Semester, it's used automatically.
//
// MULTI-SUBJECT: if `email` belongs to an EXISTING Teacher account
// (anywhere in the system — not just this Semester Admin's own scope),
// this no longer creates a new invite/account. It directly creates the
// new Subject and points it at that Teacher's existing User._id — no new
// email or registration code is sent, since the Teacher already has
// login credentials. Only a genuinely new email goes through the
// invite-and-register flow, same as before.
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { name, email, subjectName, subjectCode, section, semester } = await request.json();

    if (!email || !subjectName || !subjectCode || !section) {
      return NextResponse.json({ success: false, message: 'Enter Email, Subject, Subject Code and Group' }, { status: 400 });
    }
    if (!['A', 'B', 'C', 'D'].includes(section)) {
      return NextResponse.json({ success: false, message: 'Select a valid Group (A-D)' }, { status: 400 });
    }

    const allowedSemesters = auth.user.semesters || [];
    const semesterNum = semester != null ? parseInt(semester) : (allowedSemesters.length === 1 ? allowedSemesters[0] : null);
    if (semesterNum == null) {
      return NextResponse.json({ success: false, message: 'Select which Semester this Subject belongs to' }, { status: 400 });
    }
    if (!allowedSemesters.includes(semesterNum)) {
      return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = subjectCode.trim().toUpperCase();

    const departmentId = auth.user.departmentId;
    const departmentCode = auth.user.departmentCode;
    const shift = auth.user.shift;

    // RULE: one Subject = one Teacher, no duplicates — checked against both
    // an already-created Subject (real teacher assigned) and any pending
    // invite for the same Subject+Group, so two invites can't race for the
    // same slot either.
    const existingSubject = await Subject.findOne({ code: normalizedCode, departmentId, semester: semesterNum, section, shift });
    if (existingSubject?.teacherId) {
      return NextResponse.json({ success: false, message: `A Teacher is already assigned for ${subjectName} (${normalizedCode}) — Group ${section}` }, { status: 400 });
    }
    const existingInvite = await AdminInvite.findOne({
      role: 'teacher', departmentId, shift, semester: semesterNum, section, subjectCode: normalizedCode,
      used: false, codeExpire: { $gt: new Date() },
    });
    if (existingInvite) {
      return NextResponse.json({ success: false, message: `An invite (${existingInvite.email}) is already pending for ${subjectName} (${normalizedCode}) — Group ${section}` }, { status: 400 });
    }

    const existingUser = await User.findOne({ email: normalizedEmail });

    if (existingUser) {
      // Existing account found. Only a Teacher account can receive an
      // additional Subject this way — assigning a Student/Admin's email
      // here would be a mistake, not a real "add a subject" action.
      if (existingUser.role !== 'teacher') {
        return NextResponse.json({ success: false, message: 'This email is not a Teacher account — a Subject cannot be assigned to a different role account' }, { status: 400 });
      }

      const subject = existingSubject
        ? Object.assign(existingSubject, { name: subjectName, teacherId: existingUser._id })
        : new Subject({ name: subjectName, code: normalizedCode, departmentId, semester: semesterNum, section, shift, teacherId: existingUser._id });
      await subject.save();

      return NextResponse.json({
        success: true,
        message: `${subjectName} (${normalizedCode}) — Group ${section} assigned to ${existingUser.name}`,
        assignedExisting: true,
      }, { status: 201 });
    }

    // No existing account — brand new Teacher, goes through the normal
    // invite-and-register flow (12-digit code emailed once).
    if (!name) {
      return NextResponse.json({ success: false, message: 'Enter Name for the new Teacher' }, { status: 400 });
    }

    const code = generateInviteCode();
    const codeExpire = oneMonthFromNow();

    const invite = await AdminInvite.create({
      role: 'teacher',
      name, email: normalizedEmail,
      departmentId, departmentCode, shift, semester: semesterNum, section,
      subjectName, subjectCode: normalizedCode,
      invitedBy: auth.user._id,
      code, codeExpire,
    });

    const { subject, message, html } = inviteCodeEmail({ name, role: 'teacher', code });
    try {
      await sendEmail({ email: normalizedEmail, subject, message, html });
    } catch (mailErr) {
      await AdminInvite.findByIdAndDelete(invite._id);
      throw mailErr;
    }

    return NextResponse.json({
      success: true,
      message: `Registration code sent to ${name}'s email`,
      invite: { _id: invite._id, name: invite.name, email: invite.email, subjectName, subjectCode: normalizedCode, section, semester: semesterNum, codeExpire },
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

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
// Department+Shift+Semester.
//
// MULTI-SUBJECT: previously this filtered directly on the Teacher's own
// User.shift/semester fields, which only ever held ONE value — so once a
// Teacher had subjects in more than one Semester, they'd only show up
// under whichever Semester Admin happened to match those fields (usually
// wherever they were first invited), not every Semester Admin whose
// class they actually teach. Scoping through the Subject collection
// itself (the actual source of truth for who teaches what) fixes that:
// every Semester Admin who has assigned this Teacher a Subject sees them.
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const scopeSubjects = await Subject.find({
      departmentId: auth.user.departmentId, shift: auth.user.shift, semester: auth.user.semester,
      teacherId: { $ne: null },
    }).populate('teacherId', 'name email mobile isActive role').populate('departmentId', 'name code').select('teacherId name code section semester departmentId').lean();

    // Group by teacher so each Teacher shows once, with the list of
    // Subjects they teach specifically within this Semester Admin's scope.
    const byTeacher = new Map();
    for (const s of scopeSubjects) {
      if (!s.teacherId) continue;
      const tId = s.teacherId._id.toString();
      if (!byTeacher.has(tId)) {
        // BUG FIX: the previous populate() select omitted `role`, so
        // PersonCard's fieldsForRole() switch (which branches on
        // person.role) fell through to its default case and rendered an
        // empty details row — the card showed name/email/status but no
        // subject, department, or semester info at all. Including `role`
        // here restores that. departmentId is populated too so the card
        // can show which department this teacher belongs to.
        byTeacher.set(tId, { ...s.teacherId, departmentId: s.departmentId, subjects: [] });
      }
      byTeacher.get(tId).subjects.push({ _id: s._id, name: s.name, code: s.code, section: s.section, semester: s.semester });
    }
    const teachers = Array.from(byTeacher.values()).sort((a, b) => a.name.localeCompare(b.name));

    const pendingInvites = await AdminInvite.find({
      role: 'teacher', departmentId: auth.user.departmentId,
      shift: auth.user.shift, semester: auth.user.semester,
      used: false, codeExpire: { $gt: new Date() },
    }).sort({ section: 1 }).lean();

    return NextResponse.json({ success: true, teachers, pendingInvites });
  } catch (error) { return errorResponse(error); }
}

// GET /api/semesterAdmin/teachers?lookupEmail=... is handled via a query
// param on this same GET above would conflate two shapes of response, so
// existing-teacher lookup gets its own endpoint — see
// /api/semesterAdmin/teachers/lookup/route.js.

// POST /api/semesterAdmin/teachers — Semester Admin: assign a Subject +
// Group within their own Department+Shift+Semester to a Teacher.
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
    const { name, email, subjectName, subjectCode, section } = await request.json();

    if (!email || !subjectName || !subjectCode || !section) {
      return NextResponse.json({ success: false, message: 'Enter Email, Subject, Subject Code and Group' }, { status: 400 });
    }
    if (!['A', 'B', 'C', 'D'].includes(section)) {
      return NextResponse.json({ success: false, message: 'Select a valid Group (A-D)' }, { status: 400 });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const normalizedCode = subjectCode.trim().toUpperCase();

    const departmentId = auth.user.departmentId;
    const departmentCode = auth.user.departmentCode;
    const shift = auth.user.shift;
    const semester = auth.user.semester;

    // RULE: one Subject = one Teacher, no duplicates — checked against both
    // an already-created Subject (real teacher assigned) and any pending
    // invite for the same Subject+Group, so two invites can't race for the
    // same slot either.
    const existingSubject = await Subject.findOne({ code: normalizedCode, departmentId, semester, section, shift });
    if (existingSubject?.teacherId) {
      return NextResponse.json({ success: false, message: `A Teacher is already assigned for ${subjectName} (${normalizedCode}) — Group ${section}` }, { status: 400 });
    }
    const existingInvite = await AdminInvite.findOne({
      role: 'teacher', departmentId, shift, semester, section, subjectCode: normalizedCode,
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
        : new Subject({ name: subjectName, code: normalizedCode, departmentId, semester, section, shift, teacherId: existingUser._id });
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
      departmentId, departmentCode, shift, semester, section,
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
      invite: { _id: invite._id, name: invite.name, email: invite.email, subjectName, subjectCode: normalizedCode, section, codeExpire },
    }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

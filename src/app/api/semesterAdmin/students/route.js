import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import User from '@/lib/models/User';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

const GROUPS = ['A', 'B', 'C', 'D'];

// Reshapes a Student User doc (shadow or fully registered) into the shape
// the frontend already expects (matches the old StudentPreApproval-based
// response, so the UI barely had to change): `used` = has this person
// actually completed registration.
function toEntry(u) {
  return {
    _id: u._id,
    roll: u.studentId,
    email: u.email,
    section: u.section,
    used: u.registered !== false,
    usedByUserId: u.registered !== false ? { name: u.name } : null,
    createdAt: u.createdAt,
  };
}

// GET /api/semesterAdmin/students — Semester Admin: list Students within
// their own Department+Shift+Semester — both fully registered ones and
// "shadow" profiles (validated by this admin, Name/Password not filled in
// yet — see User.registered).
//
// STUDENT PROFILE-FIRST VALIDATION: this used to read a separate
// StudentPreApproval collection. Now Student Validation directly creates/
// reads the real Student User document — a Roll+Email+Group profile
// exists from the moment it's validated here, the student's own
// registration later just fills in Name/Password on this SAME document
// rather than creating a second one.
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    // MULTI-SEMESTER ADMIN: Student Validation is kept explicitly
    // SEPARATE per Semester (never merged) — `semester` is required in
    // the query once this admin has more than one granted Semester, and
    // validated against their own `semesters` array. With just one
    // granted Semester, it's used automatically (no selector needed).
    const { searchParams } = new URL(request.url);
    const allowedSemesters = auth.user.semesters || [];
    const requestedSemester = searchParams.get('semester');
    const semesterNum = requestedSemester != null ? parseInt(requestedSemester) : (allowedSemesters.length === 1 ? allowedSemesters[0] : null);
    if (semesterNum == null) {
      return NextResponse.json({ success: false, message: 'Select which Semester to view' }, { status: 400 });
    }
    if (!allowedSemesters.includes(semesterNum)) {
      return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    }

    // PERFORMANCE: read-only list, result goes straight to JSON — .lean()
    // skips Mongoose document hydration since nothing here saves these
    // docs back.
    const students = await User.find({
      role: 'student', departmentId: auth.user.departmentId, shift: auth.user.shift, semester: semesterNum,
    }).select('name email studentId section registered createdAt').sort({ createdAt: -1 }).lean();

    return NextResponse.json({ success: true, entries: students.map(toEntry), semester: semesterNum });
  } catch (error) { return errorResponse(error); }
}

// ExcelJS gives back a plain string/number for a normal cell, but for a
// cell Excel auto-formatted as a clickable link (very common for email
// addresses — exactly what tripped this up) it returns an object like
// { text, hyperlink } instead. Rich-text cells and formula cells are
// objects too ({ richText: [...] } / { formula, result }). Passing any of
// these straight through — into validation, into the DB, or into a JSON
// response the frontend renders directly as JSX — breaks in different
// ways (silently becomes "[object Object]", or crashes React with
// "Objects are not valid as a React child"). This always reduces a cell
// down to the plain text a person would actually read.
function cellText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'object') {
    if (typeof value.text === 'string') return value.text; // hyperlink cell
    if (Array.isArray(value.richText)) return value.richText.map(rt => rt.text).join(''); // rich text
    if (value.result !== undefined) return String(value.result); // formula cell
    return '';
  }
  return String(value);
}

// Shared logic for validating one Student (creates the shadow User
// profile + emails its registration code). Returns { ok: true } or
// { ok: false, reason } — never throws for a per-row problem, so bulk
// upload can continue past a bad row instead of aborting the whole batch.
async function addOneEntry({ roll, email, section, scope, invitedBy }) {
  const normalizedRoll = String(roll || '').trim();
  const normalizedEmail = String(email || '').toLowerCase().trim();
  const normalizedSection = String(section || '').trim().toUpperCase();
  if (!normalizedRoll || !normalizedEmail || !normalizedSection) return { ok: false, reason: 'Roll, Email and Group are required' };
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { ok: false, reason: 'Not a valid Email' };
  if (!GROUPS.includes(normalizedSection)) return { ok: false, reason: 'Group must be A, B, C or D' };

  // A Roll only ever belongs to one profile, system-wide — whether that
  // profile is still a shadow (validated, not yet registered) or fully
  // registered.
  const existingByRoll = await User.findOne({ studentId: normalizedRoll });
  if (existingByRoll) {
    return { ok: false, reason: existingByRoll.registered === false ? 'This Roll is already pre-approved (Student Validation)' : 'This Roll is already registered' };
  }
  // Same for Email — one real person, one account. If it's a shadow
  // profile under a DIFFERENT Roll or Semester, that's almost always a
  // mistaken re-entry rather than a genuinely different person, so it's
  // reported clearly rather than silently allowed (which would collide on
  // the Email's unique index anyway).
  const existingByEmail = await User.findOne({ email: normalizedEmail });
  if (existingByEmail) {
    if (existingByEmail.role !== 'student') return { ok: false, reason: 'This Email belongs to a different type of account' };
    return {
      ok: false,
      reason: existingByEmail.registered === false
        ? `This Email is already pre-approved for Roll ${existingByEmail.studentId} (Semester ${existingByEmail.semester})`
        : `This Email is already registered as Roll ${existingByEmail.studentId} (Semester ${existingByEmail.semester})`,
    };
  }

  const code = generateInviteCode();
  const codeExpire = oneMonthFromNow();

  const student = await User.create({
    // `name` and `password` are intentionally left unset — the User
    // schema only requires them once `registered` is true (see User
    // model). This profile becomes a real, loggable-in account only once
    // the Student's own registration fills those in.
    email: normalizedEmail,
    studentId: normalizedRoll,
    section: normalizedSection,
    role: 'student',
    registered: false,
    isActive: true,
    isVerified: false,
    ...scope, // departmentId, shift, semester
    createdBy: invitedBy,
    regCode: code,
    regCodeExpire: codeExpire,
  });

  try {
    const { subject, message, html } = inviteCodeEmail({ name: normalizedRoll, role: 'student', code });
    await sendEmail({ email: normalizedEmail, subject, message, html });
  } catch (mailErr) {
    await User.findByIdAndDelete(student._id);
    return { ok: false, reason: 'Failed to send Email' };
  }

  return { ok: true, roll: normalizedRoll, email: normalizedEmail };
}

// POST /api/semesterAdmin/students
// Two modes:
//   1. JSON body { roll, email, section } — add one student (small form).
//   2. multipart/form-data with a `file` field — bulk Excel/CSV upload
//      with columns Roll, Email, Group (header names matched loosely,
//      case-insensitive). Every valid row gets its own 12-digit code
//      emailed immediately; invalid/duplicate rows are skipped and
//      reported back so the Semester Admin can fix and re-upload just
//      those.
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const contentType = request.headers.get('content-type') || '';
    // MULTI-SEMESTER ADMIN: same rule as GET above — the caller specifies
    // which Semester these entries are being added for (required once
    // this admin has more than one granted Semester), validated against
    // `semesters`. Read from a query param since this branch below also
    // handles multipart/form-data bodies (bulk Excel upload), where a
    // JSON body field wouldn't be available uniformly.
    const { searchParams } = new URL(request.url);
    const allowedSemesters = auth.user.semesters || [];
    const requestedSemester = searchParams.get('semester');
    const semesterNum = requestedSemester != null ? parseInt(requestedSemester) : (allowedSemesters.length === 1 ? allowedSemesters[0] : null);
    if (semesterNum == null) {
      return NextResponse.json({ success: false, message: 'Select which Semester to add these Students to' }, { status: 400 });
    }
    if (!allowedSemesters.includes(semesterNum)) {
      return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    }
    const scope = { departmentId: auth.user.departmentId, shift: auth.user.shift, semester: semesterNum };

    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      if (!file) return NextResponse.json({ success: false, message: 'Provide an Excel/CSV file' }, { status: 400 });

      const arrayBuffer = await file.arrayBuffer();
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.load(Buffer.from(arrayBuffer));
      const worksheet = workbook.worksheets[0];
      if (!worksheet) return NextResponse.json({ success: false, message: 'Sheet not found' }, { status: 400 });

      // Map header row -> column index, matched loosely (case-insensitive,
      // ignoring surrounding whitespace) so "Roll", "roll no", "ROLL",
      // "Group", "Section" etc. all resolve to the right column.
      const headerRow = worksheet.getRow(1);
      const colIndex = { roll: null, email: null, section: null };
      headerRow.eachCell((cell, colNumber) => {
        const v = cellText(cell.value).toLowerCase().trim();
        if (v.includes('roll')) colIndex.roll = colNumber;
        else if (v.includes('email') || v.includes('mail')) colIndex.email = colNumber;
        else if (v.includes('group') || v.includes('section')) colIndex.section = colNumber;
      });
      if (!colIndex.roll || !colIndex.email || !colIndex.section) {
        return NextResponse.json({ success: false, message: 'The Excel must have "Roll", "Email" and "Group" columns' }, { status: 400 });
      }

      const results = { added: [], skipped: [] };
      for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const roll = cellText(row.getCell(colIndex.roll).value).trim();
        const email = cellText(row.getCell(colIndex.email).value).trim();
        const section = cellText(row.getCell(colIndex.section).value).trim();
        if (!roll && !email && !section) continue; // skip fully blank rows

        const result = await addOneEntry({ roll, email, section, scope, invitedBy: auth.user._id });
        if (result.ok) results.added.push({ row: rowNum, roll: result.roll, email: result.email });
        else results.skipped.push({ row: rowNum, roll, email, reason: result.reason });
      }

      return NextResponse.json({
        success: true,
        message: `${results.added.length} Student(s) pre-approved${results.skipped.length ? `, ${results.skipped.length} row(s) skipped` : ''}`,
        ...results,
      }, { status: 201 });
    }

    // Single-entry JSON mode
    const { roll, email, section } = await request.json();
    const result = await addOneEntry({ roll, email, section, scope, invitedBy: auth.user._id });
    if (!result.ok) return NextResponse.json({ success: false, message: result.reason }, { status: 400 });
    return NextResponse.json({ success: true, message: `Registration code sent to ${result.roll}'s email` }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

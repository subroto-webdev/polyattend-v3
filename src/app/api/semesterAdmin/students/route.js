import { NextResponse } from 'next/server';
import dbConnect from '@/lib/dbConnect';
import StudentPreApproval from '@/lib/models/StudentPreApproval';
import User from '@/lib/models/User';
import sendEmail from '@/lib/sendEmail';
import { inviteCodeEmail } from '@/lib/notify';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';
import ExcelJS from 'exceljs';

export const dynamic = 'force-dynamic';

// GET /api/semesterAdmin/students — Semester Admin: list pre-approved
// Roll+Email entries within their own Department+Shift+Semester, showing
// which ones are still pending vs already used to register.
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const entries = await StudentPreApproval.find({
      departmentId: auth.user.departmentId, shift: auth.user.shift, semester: auth.user.semester,
    }).populate('usedByUserId', 'name').sort({ createdAt: -1 });
    return NextResponse.json({ success: true, entries });
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

// Shared logic for adding one pre-approval entry + sending its code email.
// Returns { ok: true } or { ok: false, reason } — never throws for a
// per-row problem, so bulk upload can continue past a bad row instead of
// aborting the whole batch.
async function addOneEntry({ roll, email, scope, invitedBy }) {
  const normalizedRoll = String(roll || '').trim();
  const normalizedEmail = String(email || '').toLowerCase().trim();
  if (!normalizedRoll || !normalizedEmail) return { ok: false, reason: 'Roll and Email are required' };
  if (!/^\S+@\S+\.\S+$/.test(normalizedEmail)) return { ok: false, reason: 'Not a valid Email' };

  const existingUser = await User.findOne({ $or: [{ studentId: normalizedRoll }, { email: normalizedEmail }] });
  if (existingUser) return { ok: false, reason: 'An account already exists with this Roll/Email' };

  const existingEntry = await StudentPreApproval.findOne({ $or: [{ roll: normalizedRoll }, { email: normalizedEmail }] });
  if (existingEntry) return { ok: false, reason: existingEntry.used ? 'Registration already completed with this Roll/Email' : 'This Roll/Email is already pre-approved' };

  const code = generateInviteCode();
  const codeExpire = oneMonthFromNow();

  const entry = await StudentPreApproval.create({
    roll: normalizedRoll, email: normalizedEmail,
    ...scope, addedBy: invitedBy, code, codeExpire,
  });

  try {
    const { subject, message, html } = inviteCodeEmail({ name: normalizedRoll, role: 'student', code });
    await sendEmail({ email: normalizedEmail, subject, message, html });
  } catch (mailErr) {
    await StudentPreApproval.findByIdAndDelete(entry._id);
    return { ok: false, reason: 'Failed to send Email' };
  }

  return { ok: true, roll: normalizedRoll, email: normalizedEmail };
}

// POST /api/semesterAdmin/students
// Two modes:
//   1. JSON body { roll, email } — add one student (small form).
//   2. multipart/form-data with a `file` field — bulk Excel/CSV upload
//      with columns Roll, Email (header names matched loosely,
//      case-insensitive). Every valid row gets its own 12-digit code
//      emailed immediately; invalid/duplicate rows are skipped and
//      reported back so the Semester Admin can fix and re-upload just
//      those.
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const scope = { departmentId: auth.user.departmentId, shift: auth.user.shift, semester: auth.user.semester };
    const contentType = request.headers.get('content-type') || '';

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
      // ignoring surrounding whitespace) so "Roll", "roll no", "ROLL" etc.
      // all resolve to the same column.
      const headerRow = worksheet.getRow(1);
      const colIndex = { roll: null, email: null };
      headerRow.eachCell((cell, colNumber) => {
        const v = cellText(cell.value).toLowerCase().trim();
        if (v.includes('roll')) colIndex.roll = colNumber;
        else if (v.includes('email') || v.includes('mail')) colIndex.email = colNumber;
      });
      if (!colIndex.roll || !colIndex.email) {
        return NextResponse.json({ success: false, message: 'The Excel must have "Roll" and "Email" columns' }, { status: 400 });
      }

      const results = { added: [], skipped: [] };
      for (let rowNum = 2; rowNum <= worksheet.rowCount; rowNum++) {
        const row = worksheet.getRow(rowNum);
        const roll = cellText(row.getCell(colIndex.roll).value).trim();
        const email = cellText(row.getCell(colIndex.email).value).trim();
        if (!roll && !email) continue; // skip fully blank rows

        const result = await addOneEntry({ roll, email, scope, invitedBy: auth.user._id });
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
    const { roll, email } = await request.json();
    const result = await addOneEntry({ roll, email, scope, invitedBy: auth.user._id });
    if (!result.ok) return NextResponse.json({ success: false, message: result.reason }, { status: 400 });
    return NextResponse.json({ success: true, message: `Registration code sent to ${result.roll}'s email` }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

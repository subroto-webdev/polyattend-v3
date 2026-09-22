import { NextResponse } from 'next/server';
import prisma from '@/lib/db';
import sendEmail from '@/lib/sendEmail';
import { generateInviteCode, oneMonthFromNow } from '@/lib/inviteCode';
import { requireAuth, errorResponse } from '@/lib/auth';
import ExcelJS from 'exceljs';
export const dynamic = 'force-dynamic';
const GROUPS = ['A','B','C','D'];
function toEntry(u) { return { _id: u.id, roll: u.studentId, email: u.email, section: u.section, used: u.registered !== false, usedByUserId: u.registered !== false ? { name: u.name } : null, createdAt: u.createdAt }; }
function cellText(v) { if (v===null||v===undefined) return ''; if (v instanceof Date) return v.toISOString(); if (typeof v==='object') { if (typeof v.text==='string') return v.text; if (Array.isArray(v.richText)) return v.richText.map(r=>r.text).join(''); if (v.result!==undefined) return String(v.result); return ''; } return String(v); }
async function addOneEntry({ roll, email, section, scope, invitedBy }) {
  const nr=String(roll||'').trim(), ne=String(email||'').toLowerCase().trim(), ns=String(section||'').trim().toUpperCase();
  if (!nr||!ne||!ns) return { ok: false, reason: 'Roll, Email and Group are required' };
  if (!/^\S+@\S+\.\S+$/.test(ne)) return { ok: false, reason: 'Not a valid Email' };
  if (!GROUPS.includes(ns)) return { ok: false, reason: 'Group must be A, B, C or D' };
  const byRoll = await prisma.user.findFirst({ where: { studentId: nr } });
  if (byRoll) return { ok: false, reason: byRoll.registered===false ? 'This Roll is already pre-approved' : 'This Roll is already registered' };
  const byEmail = await prisma.user.findFirst({ where: { email: ne } });
  if (byEmail) { if (byEmail.role!=='student') return { ok: false, reason: 'This Email belongs to a different type of account' }; return { ok: false, reason: byEmail.registered===false ? `This Email is already pre-approved for Roll ${byEmail.studentId}` : `This Email is already registered as Roll ${byEmail.studentId}` }; }
  const code = generateInviteCode();
  const student = await prisma.user.create({ data: { email: ne, studentId: nr, section: ns, role: 'student', registered: false, isActive: true, isVerified: false, ...scope, createdById: invitedBy, regCode: code, regCodeExpire: oneMonthFromNow() } });
  const html = `<div style="font-family:Arial;padding:20px;border:1px solid #e2e8f0;border-radius:12px;"><h2 style="color:#1a6b4a;">Welcome to PolyAttend</h2><p>Your registration code:</p><div style="background:#f0fdf4;border:2px dashed #1a6b4a;padding:15px;text-align:center;margin:20px 0;"><span style="font-size:22px;font-weight:bold;color:#1a6b4a;letter-spacing:5px;">${code}</span></div><p style="color:#64748b;font-size:13px;">Valid for 1 month.</p></div>`;
  try { await sendEmail({ email: ne, subject: 'PolyAttend — Your Registration Code', message: `Your code: ${code}`, html }); } catch {}
  return { ok: true, entry: toEntry(student) };
}
export async function GET(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { searchParams } = new URL(request.url);
    const allowedSemesters = auth.user.semesters || [];
    const semesterNum = searchParams.get('semester')!=null ? parseInt(searchParams.get('semester')) : (allowedSemesters.length===1 ? allowedSemesters[0] : null);
    if (semesterNum==null) return NextResponse.json({ success: false, message: 'Select which Semester to view' }, { status: 400 });
    if (!allowedSemesters.includes(semesterNum)) return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    const students = await prisma.user.findMany({ where: { role: 'student', departmentId: auth.user.departmentId, shift: auth.user.shift, semester: semesterNum }, select: { id: true, name: true, email: true, studentId: true, section: true, registered: true, createdAt: true }, orderBy: { createdAt: 'desc' } });
    return NextResponse.json({ success: true, entries: students.map(toEntry), semester: semesterNum });
  } catch (error) { return errorResponse(error); }
}
export async function POST(request) {
  const auth = await requireAuth(request, ['semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const contentType = request.headers.get('content-type') || '';
    const allowedSemesters = auth.user.semesters || [];
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const file = formData.get('file');
      const semester = parseInt(formData.get('semester'));
      if (!allowedSemesters.includes(semester)) return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
      const scope = { departmentId: auth.user.departmentId, shift: auth.user.shift, semester };
      const buffer = Buffer.from(await file.arrayBuffer());
      const wb = new ExcelJS.Workbook(); await wb.xlsx.load(buffer);
      const ws = wb.worksheets[0];
      const results = [];
      for (let r = 2; r <= ws.rowCount; r++) {
        const row = ws.getRow(r);
        const roll=cellText(row.getCell(1).value), email=cellText(row.getCell(2).value), section=cellText(row.getCell(3).value);
        if (!roll && !email) continue;
        const result = await addOneEntry({ roll, email, section, scope, invitedBy: auth.user.id });
        results.push({ row: r, roll, email, ...result });
      }
      return NextResponse.json({ success: true, results });
    }
    const { roll, email, section, semester } = await request.json();
    if (!allowedSemesters.includes(parseInt(semester))) return NextResponse.json({ success: false, message: 'That Semester is outside your scope' }, { status: 403 });
    const scope = { departmentId: auth.user.departmentId, shift: auth.user.shift, semester: parseInt(semester) };
    const result = await addOneEntry({ roll, email, section, scope, invitedBy: auth.user.id });
    if (!result.ok) return NextResponse.json({ success: false, message: result.reason }, { status: 400 });
    return NextResponse.json({ success: true, entry: result.entry }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

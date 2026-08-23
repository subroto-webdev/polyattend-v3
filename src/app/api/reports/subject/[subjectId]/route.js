import ExcelJS from 'exceljs';
import Subject from '@/lib/models/Subject';
import Session from '@/lib/models/Session';
import User from '@/lib/models/User';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';
import { buildSubjectReportPDF } from '@/lib/pdfReport';

export const dynamic = 'force-dynamic';

const GREEN = 'FF1A6B4A';
const headerStyle = {
  font: { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 },
  fill: { type: 'pattern', pattern: 'solid', fgColor: { argb: GREEN } },
  alignment: { horizontal: 'center', vertical: 'middle' },
  border: { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } },
};
const applyBorder = (cell) => {
  cell.border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } };
  cell.alignment = { horizontal: 'center', vertical: 'middle' };
};

// GET /api/reports/subject/:subjectId
export async function GET(request, { params }) {
  // SECURITY FIX: previously any authenticated user — including a plain
  // student — could hit this route and pull the full class roster, every
  // student's name/ID, and their entire attendance history for a subject
  // they may not even belong to, just by knowing/guessing a subjectId.
  // This report is only meant for the subject's teacher, a scoped admin
  // (Sub Admin / Semester Admin) covering that subject, or a Super Admin.
  const auth = await requireAuth(request, ['teacher', 'admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { subjectId } = await params;
    const subject = await Subject.findById(subjectId)
      .populate('departmentId', 'name code').populate('teacherId', 'name');
    if (!subject) return errorResponse(new Error('Subject not found'), 404);
    if (!subject.departmentId) return errorResponse(new Error('Department for this subject not found'), 400);

    if (auth.user.role === 'teacher' && subject.teacherId?._id?.toString() !== auth.user._id.toString()) {
      return errorResponse(new Error('This is not your subject'), 403);
    }
    // SCOPE ENFORCEMENT: Sub Admin can only pull reports for subjects in
    // their own Department+Shift; Semester Admin additionally needs the
    // subject's Semester to match theirs.
    if (auth.user.role === 'subAdmin') {
      if (subject.departmentId._id.toString() !== auth.user.departmentId?.toString() || subject.shift !== auth.user.shift) {
        return errorResponse(new Error('This subject is outside your scope'), 403);
      }
    }
    if (auth.user.role === 'semesterAdmin') {
      if (subject.departmentId._id.toString() !== auth.user.departmentId?.toString() || subject.shift !== auth.user.shift || subject.semester !== auth.user.semester) {
        return errorResponse(new Error('This subject is outside your scope'), 403);
      }
    }

    const sessions = await Session.find({ subjectId: subject._id, status: 'ended' }).sort({ date: 1 });

    const studentFilter = {
      role: 'student', departmentId: subject.departmentId._id, semester: subject.semester,
      section: subject.section, isActive: true,
    };
    if (subject.shift) studentFilter.shift = subject.shift;

    const students = await User.find(studentFilter).sort({ name: 1 });

    const allAtt = await Attendance.find({ subjectId: subject._id });
    const attMap = {};
    allAtt.forEach(a => {
      const sid = a.studentId.toString();
      if (!attMap[sid]) attMap[sid] = {};
      // Keep markedBy alongside status so self-marked attendance can be
      // visually distinguished from teacher/QR-marked attendance below.
      attMap[sid][a.sessionId.toString()] = { status: a.status, markedBy: a.markedBy };
    });

    // FEATURE: PDF download alongside Excel — pass ?format=pdf to get a
    // printable summary PDF (grouped by Section) instead of the detailed
    // per-date Excel grid.
    const format = new URL(request.url).searchParams.get('format');
    if (format === 'pdf') {
      const buffer = await buildSubjectReportPDF({ subject, students, sessions, attMap });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="subject_${subject.code}_report.pdf"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PolyAttend';
    const ws = wb.addWorksheet('Attendance Report');

    // FIX: this used to be `7 + sessions.length`, but baseHeaders only has 6
    // columns (not 7) — the title/subtitle bar was merging one column short
    // of the real table width. Total columns = 6 base + N date columns + 4
    // summary columns.
    const totalCols = 6 + sessions.length + 4;
    ws.mergeCells(1, 1, 1, totalCols);
    const title = ws.getCell('A1');
    title.value = `ATTENDANCE REPORT - ${subject.departmentId.name}`;
    title.font = { bold: true, size: 14, color: { argb: GREEN } };
    title.alignment = { horizontal: 'center' };
    ws.getRow(1).height = 22;

    ws.mergeCells(2, 1, 2, totalCols);
    ws.getCell('A2').value = `Subject: ${subject.name} (${subject.code}) | Semester: ${subject.semester} | Group: ${subject.section} | Shift: ${subject.shift || 'N/A'} | Teacher: ${subject.teacherId?.name || 'N/A'}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getRow(2).font = { size: 10, italic: true };

    ws.addRow([]);
    ws.mergeCells(3, 1, 3, totalCols);
    ws.getCell('A3').value = 'Legend:  P = Present   S = Present (Self-marked)   A = Absent   - = No record';
    ws.getCell('A3').font = { size: 9, italic: true, color: { argb: 'FF64748B' } };
    ws.getCell('A3').alignment = { horizontal: 'left' };

    const baseHeaders = ['#', 'Student ID', 'Student Name', 'Department', 'Semester', 'Group'];
    const dateHeaders = sessions.map(s => new Date(s.date).toLocaleDateString('en-BD', { day: '2-digit', month: 'short' }));
    const summaryHeaders = ['Total', 'Present', 'Absent', 'Percentage'];
    const headerRow = ws.addRow([...baseHeaders, ...dateHeaders, ...summaryHeaders]);
    headerRow.eachCell(cell => Object.assign(cell, headerStyle));
    ws.getRow(4).height = 18;

    ws.getColumn(1).width = 5;
    ws.getColumn(2).width = 14;
    ws.getColumn(3).width = 22;
    ws.getColumn(4).width = 18;
    ws.getColumn(5).width = 10;
    ws.getColumn(6).width = 10;
    for (let i = 0; i < sessions.length; i++) ws.getColumn(7 + i).width = 10;
    ws.getColumn(7 + sessions.length).width = 8;
    ws.getColumn(8 + sessions.length).width = 10;
    ws.getColumn(9 + sessions.length).width = 10;
    ws.getColumn(10 + sessions.length).width = 12;

    students.forEach((student, idx) => {
      const sid = student._id.toString();
      const recs = attMap[sid] || {};
      const total = sessions.length;
      const present = sessions.filter(s => recs[s._id.toString()]?.status === 'present').length;
      const absent = total - present;
      const pct = total ? Math.round((present / total) * 100) : 0;

      const dateStatuses = sessions.map(s => {
        const rec = recs[s._id.toString()];
        if (!rec) return '-';
        if (rec.status === 'present') return rec.markedBy === 'self' ? 'S' : 'P';
        return 'A';
      });

      const row = ws.addRow([
        idx + 1, student.studentId, student.name,
        subject.departmentId.name, subject.semester, subject.section,
        ...dateStatuses, total, present, absent, `${pct}%`,
      ]);

      row.eachCell(cell => applyBorder(cell));

      dateStatuses.forEach((st, i) => {
        const cell = row.getCell(7 + i);
        if (st === 'P') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFD1FAE5' } };
          cell.font = { color: { argb: 'FF065F46' }, bold: true };
        } else if (st === 'S') {
          // Distinct amber styling so self-marked attendance stands out from
          // teacher/QR-marked attendance at a glance.
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
          cell.font = { color: { argb: 'FF92400E' }, bold: true };
        } else if (st === 'A') {
          cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEE2E2' } };
          cell.font = { color: { argb: 'FF991B1B' }, bold: true };
        }
      });

      const pctCell = row.getCell(10 + sessions.length);
      if (pct >= 75) pctCell.font = { color: { argb: 'FF065F46' }, bold: true };
      else if (pct >= 60) pctCell.font = { color: { argb: 'FF92400E' }, bold: true };
      else pctCell.font = { color: { argb: 'FF991B1B' }, bold: true };
    });

    ws.addRow([]);
    const sumRow = ws.addRow(['', '', `Total Students: ${students.length}`, '', '', '',
      ...sessions.map(() => ''), sessions.length, '', '', '']);
    sumRow.font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="subject_${subject.code}_report.xlsx"`,
      },
    });
  } catch (error) { return errorResponse(error); }
}

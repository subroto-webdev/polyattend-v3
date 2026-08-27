import ExcelJS from 'exceljs';
import User from '@/lib/models/User';
import Attendance from '@/lib/models/Attendance';
import { requireAuth, errorResponse } from '@/lib/auth';
import { buildStudentReportPDF } from '@/lib/pdfReport';

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

// GET /api/reports/student/:studentId
export async function GET(request, { params }) {
  const auth = await requireAuth(request);
  if (auth.error) return auth.error;
  try {
    const { studentId } = await params;
    const student = await User.findById(studentId).populate('departmentId', 'name code');
    if (!student) return errorResponse(new Error('Student not found'), 404);

    if (auth.user.role === 'student' && auth.user._id.toString() !== studentId) {
      return errorResponse(new Error('Not authorized'), 403);
    }
    // SCOPE ENFORCEMENT: Sub Admin/Semester Admin can only pull reports for
    // students within their own Department+Shift(+Semester) — same rule as
    // the subject/class reports above.
    if (auth.user.role === 'subAdmin') {
      if (student.departmentId?._id?.toString() !== auth.user.departmentId?.toString() || student.shift !== auth.user.shift) {
        return errorResponse(new Error('This student is outside your scope'), 403);
      }
    }
    if (auth.user.role === 'semesterAdmin') {
      if (student.departmentId?._id?.toString() !== auth.user.departmentId?.toString() || student.shift !== auth.user.shift || student.semester !== auth.user.semester) {
        return errorResponse(new Error('This student is outside your scope'), 403);
      }
    }

    const records = await Attendance.find({ studentId: student._id })
      .populate('subjectId', 'name code').populate('sessionId', 'date').sort({ date: -1 }).lean();

    const bySubject = {};
    records.forEach(r => {
      const sid = r.subjectId?._id?.toString();
      if (!sid) return;
      if (!bySubject[sid]) bySubject[sid] = { subject: r.subjectId, total: 0, present: 0, absent: 0, records: [] };
      bySubject[sid].total++;
      bySubject[sid][r.status]++;
      bySubject[sid].records.push(r);
    });

    // FEATURE: PDF download alongside Excel.
    const format = new URL(request.url).searchParams.get('format');
    if (format === 'pdf') {
      const buffer = await buildStudentReportPDF({ student, bySubject, records });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="student_${student.studentId}_report.pdf"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    wb.creator = 'PolyAttend';
    const ws = wb.addWorksheet('My Attendance');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = 'PERSONAL ATTENDANCE REPORT';
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: GREEN } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Student: ${student.name} | ID: ${student.studentId} | Dept: ${student.departmentId?.name} | Semester: ${student.semester} | Group: ${student.section} | Shift: ${student.shift || 'N/A'}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };
    ws.getRow(2).font = { size: 10, italic: true };

    ws.addRow([]);
    const hRow = ws.addRow(['Subject Name', 'Subject Code', 'Total Classes', 'Present', 'Absent', 'Percentage', 'Status']);
    hRow.eachCell(cell => Object.assign(cell, headerStyle));
    ws.columns = [
      { key: 'name', width: 24 }, { key: 'code', width: 14 },
      { key: 'total', width: 14 }, { key: 'present', width: 12 },
      { key: 'absent', width: 12 }, { key: 'pct', width: 14 }, { key: 'status', width: 12 },
    ];

    let overallTotal = 0, overallPresent = 0;
    Object.values(bySubject).forEach(s => {
      const pct = s.total ? Math.round((s.present / s.total) * 100) : 0;
      overallTotal += s.total; overallPresent += s.present;
      const row = ws.addRow([s.subject.name, s.subject.code, s.total, s.present, s.absent, `${pct}%`,
      pct >= 75 ? 'Good' : pct >= 60 ? 'Warning' : 'Critical']);
      row.eachCell(cell => applyBorder(cell));
      const pctCell = row.getCell(6);
      if (pct >= 75) { pctCell.font = { color: { argb: 'FF065F46' }, bold: true }; row.getCell(7).font = { color: { argb: 'FF065F46' }, bold: true }; }
      else if (pct >= 60) { pctCell.font = { color: { argb: 'FF92400E' }, bold: true }; row.getCell(7).font = { color: { argb: 'FF92400E' }, bold: true }; }
      else { pctCell.font = { color: { argb: 'FF991B1B' }, bold: true }; row.getCell(7).font = { color: { argb: 'FF991B1B' }, bold: true }; }
    });

    ws.addRow([]);
    const overallPct = overallTotal ? Math.round((overallPresent / overallTotal) * 100) : 0;
    const totRow = ws.addRow(['OVERALL', '', overallTotal, overallPresent, overallTotal - overallPresent, `${overallPct}%`, '']);
    totRow.font = { bold: true };
    totRow.eachCell(cell => applyBorder(cell));

    const ws2 = wb.addWorksheet('Date-wise Records');
    const h2 = ws2.addRow(['Date', 'Subject', 'Subject Code', 'Status', 'Method']);
    h2.eachCell(cell => Object.assign(cell, headerStyle));
    ws2.columns = [{ width: 16 }, { width: 24 }, { width: 14 }, { width: 12 }, { width: 14 }];
    records.forEach(r => {
      const methodLabel = r.status !== 'present' ? '-' : r.markedBy === 'self' ? 'Self' : r.markedBy === 'manual' ? 'Manual' : r.markedBy === 'search' ? 'Search' : '-';
      const row = ws2.addRow([
        new Date(r.date).toLocaleDateString('en-BD'),
        r.subjectId?.name || '-', r.subjectId?.code || '-', r.status, methodLabel,
      ]);
      row.eachCell(cell => applyBorder(cell));
      row.getCell(4).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: r.status === 'present' ? 'FFD1FAE5' : 'FFFEE2E2' } };
      row.getCell(4).font = { color: { argb: r.status === 'present' ? 'FF065F46' : 'FF991B1B' }, bold: true };
      if (r.status === 'present' && r.markedBy === 'self') {
        row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        row.getCell(5).font = { color: { argb: 'FF92400E' }, bold: true };
      }
    });

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="student_${student.studentId}_report.xlsx"`,
      },
    });
  } catch (error) { return errorResponse(error); }
}

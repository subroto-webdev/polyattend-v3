import ExcelJS from 'exceljs';
import Session from '@/lib/models/Session';
import Attendance from '@/lib/models/Attendance';
import User from '@/lib/models/User';
import { requireAuth, errorResponse } from '@/lib/auth';
import { buildSessionReportPDF } from '@/lib/pdfReport';

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

// GET /api/reports/class/:sessionId
export async function GET(request, { params }) {
  // SECURITY FIX: was open to any authenticated user (including students),
  // exposing the full class roster + who was present/absent for any session
  // ID. Restrict to the owning teacher, a scoped admin covering that
  // session, or a Super Admin.
  const auth = await requireAuth(request, ['teacher', 'admin', 'subAdmin', 'semesterAdmin']);
  if (auth.error) return auth.error;
  try {
    const { sessionId } = await params;
    const session = await Session.findById(sessionId)
      .populate('departmentId', 'name code').populate('subjectId', 'name code').populate('teacherId', 'name');
    if (!session) return errorResponse(new Error('Session not found'), 404);
    if (!session.departmentId) return errorResponse(new Error('Department for this session not found'), 400);

    if (auth.user.role === 'teacher' && session.teacherId?._id?.toString() !== auth.user._id.toString()) {
      return errorResponse(new Error('This is not your session'), 403);
    }
    // SCOPE ENFORCEMENT: same rule as the subject report — Sub Admin needs
    // matching Department+Shift, Semester Admin also needs matching Semester.
    if (auth.user.role === 'subAdmin') {
      if (session.departmentId._id.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift) {
        return errorResponse(new Error('This session is outside your scope'), 403);
      }
    }
    if (auth.user.role === 'semesterAdmin') {
      if (session.departmentId._id.toString() !== auth.user.departmentId?.toString() || session.shift !== auth.user.shift || session.semester !== auth.user.semester) {
        return errorResponse(new Error('This session is outside your scope'), 403);
      }
    }

    const attendance = await Attendance.find({ sessionId: session._id }).populate('studentId', 'name studentId section').lean();

    const studentFilter = {
      role: 'student', departmentId: session.departmentId._id, semester: session.semester,
      section: session.section, isActive: true,
    };
    if (session.shift) studentFilter.shift = session.shift;

    const allStudents = await User.find(studentFilter).sort({ studentId: 1 }).lean();

    const presentMap = {};
    attendance.forEach(a => { presentMap[a.studentId._id.toString()] = a; });

    // FEATURE: PDF download alongside Excel.
    const format = new URL(request.url).searchParams.get('format');
    if (format === 'pdf') {
      const buffer = await buildSessionReportPDF({ session, allStudents, presentMap });
      return new Response(buffer, {
        status: 200,
        headers: {
          'Content-Type': 'application/pdf',
          'Content-Disposition': `attachment; filename="session_${sessionId}.pdf"`,
        },
      });
    }

    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Attendance');

    ws.mergeCells('A1:G1');
    ws.getCell('A1').value = `${session.departmentId.name} - Attendance Sheet`;
    ws.getCell('A1').font = { bold: true, size: 14, color: { argb: GREEN } };
    ws.getCell('A1').alignment = { horizontal: 'center' };

    ws.mergeCells('A2:G2');
    ws.getCell('A2').value = `Subject: ${session.subjectId?.name || 'N/A'} | Semester: ${session.semester} | Group: ${session.section} | Shift: ${session.shift || 'N/A'} | Date: ${new Date(session.date).toLocaleDateString('en-BD')} | Teacher: ${session.teacherId?.name || 'N/A'}`;
    ws.getCell('A2').alignment = { horizontal: 'center' };

    ws.addRow([]);
    const headerRow = ws.addRow(['#', 'Student ID', 'Student Name', 'Group', 'Status', 'Method', 'Marked Time']);
    headerRow.eachCell(cell => Object.assign(cell, headerStyle));
    ws.columns = [{ width: 6 }, { width: 14 }, { width: 24 }, { width: 10 }, { width: 12 }, { width: 14 }, { width: 16 }];

    const methodLabel = (markedBy) => {
      switch (markedBy) {
        case 'self': return 'Self';
        case 'manual': return 'Manual';
        case 'search': return 'Search';
        default: return '-';
      }
    };

    allStudents.forEach((student, i) => {
      const rec = presentMap[student._id.toString()];
      const isPresent = !!rec && rec.status === 'present';
      const isSelf = isPresent && rec.markedBy === 'self';
      const row = ws.addRow([
        i + 1, student.studentId, student.name, student.section,
        isPresent ? 'Present' : 'Absent',
        isPresent ? methodLabel(rec.markedBy) : '-',
        rec?.scannedAt ? new Date(rec.scannedAt).toLocaleTimeString() : '-',
      ]);
      row.getCell(5).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: isPresent ? 'FFD1FAE5' : 'FFFEE2E2' } };
      row.getCell(5).font = { color: { argb: isPresent ? 'FF065F46' : 'FF991B1B' }, bold: true };
      // Self-marked attendance gets its own amber highlight in the Method
      // column so teachers/admins can spot it at a glance in the report.
      if (isSelf) {
        row.getCell(6).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF3C7' } };
        row.getCell(6).font = { color: { argb: 'FF92400E' }, bold: true };
      }
      row.eachCell(cell => applyBorder(cell));
    });

    const presentCount = Object.values(presentMap).filter(a => a.status === 'present').length;
    ws.addRow([]);
    ws.addRow(['', '', '', 'Total', allStudents.length, '', '']).font = { bold: true };
    ws.addRow(['', '', '', 'Present', presentCount, '', '']).font = { bold: true, color: { argb: 'FF065F46' } };
    ws.addRow(['', '', '', 'Absent', allStudents.length - presentCount, '', '']).font = { bold: true, color: { argb: 'FF991B1B' } };
    ws.addRow(['', '', '', 'Percentage', `${allStudents.length ? Math.round(presentCount / allStudents.length * 100) : 0}%`, '', '']).font = { bold: true };

    const buffer = await wb.xlsx.writeBuffer();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="session_${sessionId}.xlsx"`,
      },
    });
  } catch (error) { return errorResponse(error); }
}

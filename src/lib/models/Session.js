import mongoose from 'mongoose';

const sessionSchema = new mongoose.Schema({
  teacherId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  semester: { type: Number, required: true },
  section: { type: String, required: true },
  shift: { type: String, enum: ['1st', '2nd'] },
  date: { type: Date, default: Date.now },
  startTime: { type: Date, default: Date.now },
  endTime: { type: Date },
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
  totalStudents: { type: Number, default: 0 },
  presentCount: { type: Number, default: 0 },
  // LEGACY — the old Semester Admin "Substitute Class" feature used to set
  // these when a Semester Admin covered a class on a Teacher's behalf.
  // That feature has been retired (a Teacher now covers their own missed
  // classes directly, via the Covered Miss Class page), so no route sets
  // these anymore. Left in the schema only so old historical Sessions
  // still read back correctly.
  isSubstitute: { type: Boolean, default: false },
  substituteBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

// PERFORMANCE: every read of this collection filters by subjectId+date
// (Missed Classes Report, Covered Miss Class, subject-level reports) or
// by teacherId+date (Teacher Dashboard, Teacher Session Report). With no
// index at all beyond the default _id, every one of those queries was a
// full collection scan — fine with a handful of rows, but it gets
// linearly slower as Sessions pile up over the semester.
sessionSchema.index({ subjectId: 1, date: 1 });
sessionSchema.index({ teacherId: 1, date: -1 });

// PERFORMANCE: the Student Dashboard polls /api/attendance/active-session
// repeatedly (to auto-show "Mark My Attendance" the moment a teacher
// starts a session), which runs
//   Session.findOne({ status: 'active', departmentId, semester, section, shift })
// This is a hot, frequently-repeated query with no supporting index before
// this — every poll from every student was a full collection scan.
sessionSchema.index({ status: 1, departmentId: 1, semester: 1, section: 1 });

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);

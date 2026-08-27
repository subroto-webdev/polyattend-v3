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

export default mongoose.models.Session || mongoose.model('Session', sessionSchema);

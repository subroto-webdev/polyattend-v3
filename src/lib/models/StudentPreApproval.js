import mongoose from 'mongoose';

// A Semester Admin pre-approves students (one by one, or via bulk Excel
// upload) by entering Roll + Email before the student ever registers.
// Each entry gets its own 12-digit code emailed to the student.
// The student can only complete registration by supplying an Email + Roll
// combination that matches one of these entries AND the matching code —
// this is what stops one person from registering multiple times with
// different emails, since only pre-approved Roll+Email pairs are accepted.
// Once used, `used` is set so that Roll/Email can never be used again.
const studentPreApprovalSchema = new mongoose.Schema({
  roll: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true },

  // Scope this Roll+Email belongs to, inherited from the Semester Admin
  // who added it — used to place the student correctly once they register.
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  shift: { type: String, enum: ['1st', '2nd'], required: true },
  semester: { type: Number, required: true, min: 1, max: 8 },

  addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }, // the Semester Admin

  code: { type: String, required: true }, // 12-digit alphanumeric
  codeExpire: { type: Date, required: true }, // 1 month from creation

  used: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
  usedByUserId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
}, { timestamps: true });

// A Roll can only be pre-approved once system-wide, and so can an Email —
// this is the actual duplicate-registration guard your Semester Admin
// workflow is meant to enforce.
studentPreApprovalSchema.index({ roll: 1 }, { unique: true });
studentPreApprovalSchema.index({ email: 1 }, { unique: true });

export default mongoose.models.StudentPreApproval || mongoose.model('StudentPreApproval', studentPreApprovalSchema);

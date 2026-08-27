import mongoose from 'mongoose';

// An invite created by a higher-level admin for a Sub Admin, Semester Admin,
// or Teacher. Holds every field that admin pre-filled (name, department,
// shift, semester, subject, etc. — whichever apply to the role) plus a
// 12-digit alphanumeric code sent to the invitee's email. The invitee later
// visits the Admin Registration page and supplies Email + Code (+ Password,
// and for Teacher/Student also Roll where relevant) to activate the real
// User account — no real User/password exists until that step succeeds.
//
// Mirrors the same "don't create a real account until verified" pattern
// already used by PendingRegistration for student/teacher public signup.
const adminInviteSchema = new mongoose.Schema({
  role: { type: String, enum: ['subAdmin', 'semesterAdmin', 'teacher'], required: true },
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },

  // Scope fields — which ones are set depends on role:
  //   subAdmin:      departmentId, departmentCode, shift
  //   semesterAdmin: departmentId, departmentCode, shift, semester
  //   teacher:       departmentId, departmentCode, shift, semester, section,
  //                  subjectName, subjectCode
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departmentCode: { type: String, trim: true },
  shift: { type: String, enum: ['1st', '2nd'] },
  semester: { type: Number, min: 1, max: 8 },
  section: { type: String, enum: ['A', 'B', 'C', 'D'] },
  subjectName: { type: String, trim: true },
  subjectCode: { type: String, trim: true },

  // Who issued this invite (Super Admin for subAdmin, Sub Admin for
  // semesterAdmin, Semester Admin for teacher).
  invitedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  code: { type: String, required: true }, // 12-digit alphanumeric, shown once via email
  codeExpire: { type: Date, required: true }, // 1 month from creation
  used: { type: Boolean, default: false },
  usedAt: { type: Date, default: null },
}, { timestamps: true });

adminInviteSchema.index({ email: 1, role: 1 });

export default mongoose.models.AdminInvite || mongoose.model('AdminInvite', adminInviteSchema);

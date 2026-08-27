import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

// ── FIX (Requirement #5) ──────────────────────────────────────────────────
// Public registration must NOT create a real User document until the person
// actually submits a valid, unexpired email OTP. Previously `register-public`
// called User.create(...) immediately (with isVerified:false) and only OTP
// verification flipped a flag — meaning an unverified visitor's data (email,
// hashed password, studentId, etc.) was permanently stored even if they never
// verified. This model instead holds the pending signup separately; the real
// User document is only created inside /api/auth/verify-email once the OTP
// check succeeds. The TTL index below also auto-deletes stale, never-verified
// signups after 24 hours so they don't pile up forever.
const pendingRegistrationSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, lowercase: true, trim: true, index: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['student', 'teacher'], required: true },
  shift: { type: String, enum: ['1st', '2nd'] },

  studentId: { type: String },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  semester: { type: Number },
  section: { type: String },

  // Links back to the StudentPreApproval entry this signup was validated
  // against (Roll+Email+Code match). Marked used only once verify-email
  // actually creates the real User — not here — so an abandoned signup
  // (OTP never confirmed) doesn't burn the student's one-time pre-approval.
  preApprovalId: { type: mongoose.Schema.Types.ObjectId, ref: 'StudentPreApproval' },
  mobile: { type: String, trim: true },

  otp: { type: String, required: true },
  otpExpire: { type: Date, required: true },

  createdAt: { type: Date, default: Date.now, expires: 60 * 60 * 24 }, // auto-cleanup after 24h
});

pendingRegistrationSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

export default mongoose.models.PendingRegistration || mongoose.model('PendingRegistration', pendingRegistrationSchema);

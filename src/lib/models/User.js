import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const userSchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true, minlength: 6 },
  // HIERARCHY: 'subAdmin' manages one Department+Shift; 'semesterAdmin'
  // manages one Department+Shift+Semester under a subAdmin. Both are
  // created via an invite (see AdminInvite model) and are separate from
  // the original single 'admin' (Super Admin) role.
  role: { type: String, enum: ['admin', 'subAdmin', 'semesterAdmin', 'teacher', 'student'], required: true },
  shift: { type: String, enum: ['1st', '2nd'] },

  // Sub Admin scope: which Department they manage (shift is the `shift`
  // field above). Also reused as the Teacher's department below.
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department' },
  departmentCode: { type: String, trim: true },

  // Semester Admin scope: department+shift (above) + semester (below).
  // Teacher also uses `semester` + `section` (Group) once created.
  semester: { type: Number, min: 1, max: 8 },
  section: { type: String, enum: ['A', 'B', 'C', 'D'] },

  // Teacher fields (set at creation by a Semester Admin; see Subject model
  // for the actual subject/group binding — subjectId here is a convenience
  // pointer to that same Subject document for quick lookups).
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },

  // Student fields
  studentId: { type: String, unique: true, sparse: true },
  mobile: { type: String, trim: true },

  // Who created this account (Super Admin → Sub Admin → Semester Admin →
  // Teacher chain). Lets each level list only what it created, directly
  // or transitively, without re-deriving it from department/shift/semester
  // matching alone (useful once an admin's own scope fields change later).
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },

  isActive: { type: Boolean, default: true },
  isVerified: { type: Boolean, default: false },
  verificationOTP: { type: String, default: null },
  verificationExpire: { type: Date, default: null },
  resetPasswordOTP: { type: String, default: null },
  resetPasswordExpire: { type: Date, default: null },

  // 2FA (Super Admin, Sub Admin, Semester Admin only): a fresh OTP is
  // generated at login step 1 and must be confirmed at step 2 before a
  // token is issued.
  loginOTP: { type: String, default: null },
  loginOTPExpire: { type: Date, default: null },
}, { timestamps: true });

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.matchPassword = async function (entered) {
  return bcrypt.compare(entered, this.password);
};

userSchema.methods.toJSON = function () {
  const obj = this.toObject();
  delete obj.password;
  return obj;
};

export default mongoose.models.User || mongoose.model('User', userSchema);

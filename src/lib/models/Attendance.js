import mongoose from 'mongoose';

const attendanceSchema = new mongoose.Schema({
  sessionId: { type: mongoose.Schema.Types.ObjectId, ref: 'Session', required: true },
  studentId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  departmentId: { type: mongoose.Schema.Types.ObjectId, ref: 'Department', required: true },
  semester: { type: Number, required: true },
  section: { type: String, required: true },
  className: {
    type: String,
    trim: true,
    required: true,
    default: function () {
      // NOTE: Mongoose's bulkWrite(upsert) runs `setDefaultsOnInsert` internally
      // and can invoke this default with a null/undefined `this` context (not a
      // real hydrated document). Optional-chain everything so it never crashes —
      // this is what caused "Cannot read properties of null (reading 'semester')".
      const semester = this?.semester;
      const section = this?.section;
      if (semester != null && section != null && section !== '') {
        return `Class ${semester}-${section}`;
      }
      return 'Class unknown';
    },
  },
  date: { type: Date, default: Date.now },
  status: { type: String, enum: ['present', 'absent'], default: 'present' },
  scannedAt: { type: Date },
  markedBy: { type: String, enum: ['manual', 'search', 'self'], default: 'manual' },
}, { timestamps: true });

attendanceSchema.index({ sessionId: 1, studentId: 1 }, { unique: true });

// PERFORMANCE: this is by far the largest, fastest-growing collection (one
// row per student per session). But the only index was the compound unique
// one above, keyed by sessionId — useless for the two query shapes every
// report route actually runs:
//   - Attendance.find({ studentId })            -> /api/reports/student/[id]
//   - Attendance.find({ subjectId })             -> /api/reports/subject/[id],
//                                                    reports/class, dashboards
// Without these, both queries were full collection scans, and got linearly
// slower as attendance rows piled up over the semester — this was the
// single biggest reason reports/exports and dashboards felt slow.
attendanceSchema.index({ studentId: 1, date: -1 });
attendanceSchema.index({ subjectId: 1, date: -1 });

export default mongoose.models.Attendance || mongoose.model('Attendance', attendanceSchema);

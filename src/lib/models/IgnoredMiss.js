import mongoose from 'mongoose';

// MISSED SESSIONS — DISMISS FEATURE
// When a Semester Admin decides a "Miss" entry from the Missed Sessions
// list doesn't actually need a Substitute class (e.g. it turns out the
// college was closed for an unlisted reason, or it was a data mistake),
// they can dismiss it instead of covering it. That's recorded here rather
// than a real Session, since no class/attendance actually happened for
// that date — it just stops that (Subject, date) pair from showing up as
// an outstanding miss.
const ignoredMissSchema = new mongoose.Schema({
  subjectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject', required: true },
  date: { type: Date, required: true },
  ignoredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  reason: { type: String, trim: true },
}, { timestamps: true });

ignoredMissSchema.index({ subjectId: 1, date: 1 }, { unique: true });

export default mongoose.models.IgnoredMiss || mongoose.model('IgnoredMiss', ignoredMissSchema);

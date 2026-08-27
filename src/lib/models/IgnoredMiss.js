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

// AUTO-EXPIRE: once a dismissed entry's `date` is more than 7 days old,
// it can no longer appear in the Missed Classes Report anyway (see
// LOOKBACK_DAYS in /api/reports/missed-sessions), so there's no reason to
// keep the dismissal record around. MongoDB's TTL monitor runs roughly
// once every 60s and deletes the doc once `date + 7 days` has passed.
// NOTE: MongoDB does NOT let a collection have two TTL indexes on
// different fields, and does NOT let you change expireAfterSeconds on an
// existing index without dropping it first — if this index already
// exists on your Atlas cluster from before, run:
//   db.ignoredmisses.dropIndex("date_1")
// (or whatever mongoose named it) before redeploying, or the new
// expireAfterSeconds value silently won't take effect.
ignoredMissSchema.index({ date: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });

export default mongoose.models.IgnoredMiss || mongoose.model('IgnoredMiss', ignoredMissSchema);

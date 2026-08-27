import mongoose from 'mongoose';

const holidaySchema = new mongoose.Schema({
  title: { type: String, required: true, trim: true },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  type: { type: String, enum: ['friday', 'eid', 'puja', 'national', 'semester_break', 'other'], default: 'other' },
  recurring: { type: Boolean, default: false },
  description: { type: String },
}, { timestamps: true });

// PERFORMANCE: every attendance/session/missed-report calculation queries
// Holiday by an overlapping startDate/endDate range. This table stays
// small, so the win here is minor compared to Session/Subject/User, but
// it's a free fix while touching the others.
holidaySchema.index({ startDate: 1, endDate: 1 });

export default mongoose.models.Holiday || mongoose.model('Holiday', holidaySchema);

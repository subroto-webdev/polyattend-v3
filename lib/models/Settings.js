import mongoose from 'mongoose';

// Single-document collection: there is always exactly one Settings document
// (upserted by key 'global'). Keeping it as a real collection (instead of an
// env var) means the admin can change it at runtime from the Settings page
// without a redeploy.
const settingsSchema = new mongoose.Schema({
  key: { type: String, default: 'global', unique: true },

  // Minimum attendance percentage a student must have in a subject to be
  // considered "exam eligible". Shown on the student dashboard as a warning
  // badge when a subject's attendance falls below this. Admin-configurable
  // from /admin/settings. Default matches the previously hard-coded 70%.
  attendanceThreshold: { type: Number, default: 70, min: 0, max: 100 },
}, { timestamps: true });

export default mongoose.models.Settings || mongoose.model('Settings', settingsSchema);

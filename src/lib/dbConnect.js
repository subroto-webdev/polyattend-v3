import mongoose from 'mongoose';
import Department from './models/Department';
// ── CRITICAL FIX: "Schema hasn't been registered for model 'X'" ───────────
// In serverless deployments (e.g. Vercel), each API route is bundled into
// its own isolated function. A model only gets registered with Mongoose
// (`mongoose.model('X', schema)`) when its file is actually imported
// *somewhere in that function's bundle*. Many routes call `.populate('...')`
// on a ref (e.g. Attendance.sessionId → 'Session') without ever importing
// that model directly — this worked by accident locally (a single long-lived
// dev server keeps every model registered once anything touches it) but
// fails in production the moment a route's cold-start bundle doesn't happen
// to include that model. This is exactly what caused errors like:
//   "Schema hasn't been registered for model 'Session'. Use mongoose.model(name, schema)"
// on the student attendance/report routes, and could affect any other
// route's populate() the same way.
//
// The fix: import every model here, in the one file (`dbConnect`) that
// literally every route already calls before touching the database. That
// guarantees all schemas are registered first, everywhere, regardless of
// which route cold-starts. Department was already imported here (for
// seeding) — that's precisely why departmentId populates never had this
// bug while sessionId/subjectId/studentId ones did.
import './models/User';
import './models/Subject';
import './models/Session';
import './models/Attendance';
import './models/Holiday';
import './models/Feedback';
import './models/PendingRegistration';
import './models/AdminInvite';
import './models/StudentPreApproval';
import './models/Settings';

const MONGODB_URI = process.env.MONGODB_URI;

let cached = global._mongoose;
if (!cached) cached = global._mongoose = { conn: null, promise: null, seeded: false };

async function autoSeedDepartments() {
  if (cached.seeded) return;
  try {
    const defaultDepartments = [
      { name: 'Computer Science & Technology', code: 'CST', technologyCode: '85' },
      { name: 'Mechatronics Technology', code: 'MCT', technologyCode: '92' },
      { name: 'Architecture Technology', code: 'ARC', technologyCode: '61' },
      { name: 'Food Technology', code: 'FT', technologyCode: '69' },
      { name: 'Refrigeration & Air Conditioning Technology', code: 'RAC', technologyCode: '72' },
    ];
    const count = await Department.countDocuments();
    if (count === 0) {
      await Department.insertMany(defaultDepartments.map(d => ({ ...d, isActive: true })));
      console.log('✅ TPI Departments seeded successfully!');
    } else {
      for (const dept of defaultDepartments) {
        const exists = await Department.findOne({ code: dept.code });
        if (!exists) {
          await Department.create({ ...dept, isActive: true });
        } else if (exists.technologyCode !== dept.technologyCode || !exists.technologyCode) {
          await Department.updateOne({ code: dept.code }, { $set: { technologyCode: dept.technologyCode, name: dept.name } });
        }
      }
    }
    cached.seeded = true;
  } catch (err) {
    console.error('⚠️ Department seed error:', err.message);
  }
}

export default async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    if (!MONGODB_URI) throw new Error('MONGODB_URI environment variable is not set');
    cached.promise = mongoose.connect(MONGODB_URI, {
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    }).then(m => m);
  }
  cached.conn = await cached.promise;
  await autoSeedDepartments();
  return cached.conn;
}

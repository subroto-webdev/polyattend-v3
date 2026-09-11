import jwt from 'jsonwebtoken';
import { NextResponse } from 'next/server';
import dbConnect from './dbConnect';
import User from './models/User';

export function generateToken(id) {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE || '7d' });
}

// MULTI-SEMESTER ADMIN: a Semester Admin's granted semesters live in
// `semesters` (array) — see User model. Accounts created before this
// feature existed (or any created straight from `semester` for some
// other reason) only have the old singular `semester` field set. This
// normalizes every semesterAdmin user object to always have a populated
// `semesters` array, falling back to `[semester]` — so every place in
// the codebase can safely just read `user.semesters` without a legacy
// branch of its own.
export function normalizeSemesterAdmin(user) {
  if (user && user.role === 'semesterAdmin' && (!user.semesters || user.semesters.length === 0) && user.semester) {
    user.semesters = [user.semester];
  }
  return user;
}

/**
 * Authenticates the request using the Bearer token and (optionally) checks role.
 * Returns { user } on success, or { error: NextResponse } on failure.
 * Usage:
 *   const auth = await requireAuth(req);
 *   if (auth.error) return auth.error;
 *   const { user } = auth;
 */
export async function requireAuth(request, roles = null) {
  await dbConnect();
  try {
    const token = request.cookies.get('token')?.value;
    if (!token) {
      return { error: NextResponse.json({ success: false, message: 'Not authorized, no token' }, { status: 401 }) };
    }
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select('-password').lean();
    if (!user || !user.isActive) {
      return { error: NextResponse.json({ success: false, message: 'User not found or inactive' }, { status: 401 }) };
    }
    if (roles && !roles.includes(user.role)) {
      return { error: NextResponse.json({ success: false, message: `Role '${user.role}' is not authorized to access this route` }, { status: 403 }) };
    }
    normalizeSemesterAdmin(user);
    return { user };
  } catch (error) {
    return { error: NextResponse.json({ success: false, message: 'Not authorized, token failed' }, { status: 401 }) };
  }
}

export function errorResponse(error, status = 500) {
  // The full error is always logged server-side (for debugging), but a raw JS
  // internal error (e.g. "Cannot read properties of null...") is never sent
  // to the client — a friendly message is sent instead.
  console.error('[API ERROR]', error);

  const raw = error?.message || '';
  const isRawJsCrash = /Cannot read propert(y|ies) of (null|undefined)/i.test(raw) || error instanceof TypeError;

  const message = isRawJsCrash
    ? 'An unexpected problem occurred. Please try again, and contact your Admin if the problem persists.'
    : (raw || 'Server error');

  return NextResponse.json({
    success: false,
    message,
    // Only show the raw error in development (for debugging), never in production.
    debug: process.env.NODE_ENV !== 'production' ? raw : undefined,
  }, { status });
}

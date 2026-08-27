import crypto from 'crypto';

// 12-character alphanumeric code (letters + numbers), used for every
// invite-based registration flow: Sub Admin, Semester Admin, Teacher, and
// Student pre-approval. Excludes visually-confusing characters (0/O, 1/I/l)
// so the code is easy to read and re-type correctly from an email.
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 12) {
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

// Standard expiry for every invite/pre-approval code in this system: 1 month.
export function oneMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

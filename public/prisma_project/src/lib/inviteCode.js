import crypto from 'crypto';

// MongoDB version এর মতোই — DB dependency নেই, কোনো পরিবর্তন লাগেনি।
// 12-character alphanumeric, visually confusing chars বাদ দেওয়া।
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

export function generateInviteCode(length = 12) {
  let code = '';
  const bytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    code += ALPHABET[bytes[i] % ALPHABET.length];
  }
  return code;
}

export function oneMonthFromNow() {
  const d = new Date();
  d.setMonth(d.getMonth() + 1);
  return d;
}

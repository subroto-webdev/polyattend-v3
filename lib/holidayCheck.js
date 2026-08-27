import Holiday from './models/Holiday';

// Bangladesh college week-off days: Friday (5) AND Saturday (6).
// Previously only Friday was excluded here — Saturday silently fell through
// as a normal working day unless an admin manually added it as a Holiday
// every single week. Centralizing this so every caller (holiday check route,
// session creation, teacher session report) agrees on the same definition.
const WEEKEND_DAYS = [5, 6]; // 0=Sun ... 5=Fri, 6=Sat

/**
 * Returns { isHoliday, reason, holiday } for a given date.
 * reason is 'Friday' | 'Saturday' | 'holiday' | null.
 */
export async function checkHoliday(date) {
  const checkDate = new Date(date);
  const day = checkDate.getDay();

  if (day === 5) return { isHoliday: true, reason: 'Friday', holiday: null };
  if (day === 6) return { isHoliday: true, reason: 'Saturday', holiday: null };

  // Normalize to a day boundary so time-of-day on `date` doesn't cause a
  // Holiday range (stored as full-day start/end) to miss a same-day match.
  const dayStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 0, 0, 0);
  const dayEnd = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 23, 59, 59, 999);

  const holiday = await Holiday.findOne({ startDate: { $lte: dayEnd }, endDate: { $gte: dayStart } });
  return { isHoliday: !!holiday, reason: holiday ? 'holiday' : null, holiday: holiday || null };
}

export function isWeekend(date) {
  return WEEKEND_DAYS.includes(new Date(date).getDay());
}

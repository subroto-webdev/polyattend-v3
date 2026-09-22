import prisma from './db';

const WEEKEND_DAYS = [5, 6]; // Friday, Saturday

export async function checkHoliday(date) {
  const checkDate = new Date(date);
  const day = checkDate.getDay();
  if (day === 5) return { isHoliday: true, reason: 'Friday', holiday: null };
  if (day === 6) return { isHoliday: true, reason: 'Saturday', holiday: null };

  const dayStart = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 0, 0, 0);
  const dayEnd   = new Date(checkDate.getFullYear(), checkDate.getMonth(), checkDate.getDate(), 23, 59, 59, 999);

  const holiday = await prisma.holiday.findFirst({
    where: { startDate: { lte: dayEnd }, endDate: { gte: dayStart } },
  });

  return { isHoliday: !!holiday, reason: holiday ? 'holiday' : null, holiday };
}

export function isWeekend(date) {
  return WEEKEND_DAYS.includes(new Date(date).getDay());
}

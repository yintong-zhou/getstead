import { addDays, monthOf, monthStart, toDate } from "../server/cash-flow/dates.ts";

export function calendarDays(month: string, min: string, max: string) {
  const first = monthStart(month);
  const offset = (toDate(first).getUTCDay() + 6) % 7;
  const start = toDate(addDays(first, -offset));
  return Array.from({ length: 42 }, (_, index) => {
    const date = new Date(start.getTime() + index * 86_400_000).toISOString().split("T")[0];
    const outside = monthOf(date) !== month;
    return { date, outside, disabled: outside || date < min || date > max };
  });
}

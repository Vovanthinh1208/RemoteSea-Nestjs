const MONTH_LABELS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

export interface MonthKey {
  key: string;
  label: string;
}

export const monthKeyOf = (date: Date): string =>
  `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;

export const buildRecentMonthKeys = (count: number, from: Date): MonthKey[] => {
  const keys: MonthKey[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const monthStart = new Date(
      Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - i, 1),
    );
    keys.push({
      key: monthKeyOf(monthStart),
      label: MONTH_LABELS[monthStart.getUTCMonth()],
    });
  }
  return keys;
};

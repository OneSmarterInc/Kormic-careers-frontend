/** Calendar-only conversions: never parse a UTC timestamp for a date of birth. */
export function displayDate(value: string): string {
  if (value.startsWith('draft:')) return value.slice(6);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  return match ? `${match[2]}-${match[3]}-${match[1]}` : value;
}
export function inputDate(value: string): string | undefined {
  const m = /^(\d{2})-(\d{2})-(\d{4})$/.exec(value);
  if (!m) return undefined;
  const y = Number(m[3]),
    month = Number(m[1]),
    day = Number(m[2]);
  const d = new Date(y, month - 1, day, 12);
  if (d.getFullYear() !== y || d.getMonth() !== month - 1 || d.getDate() !== day) return undefined;
  return `${m[3]}-${m[1]}-${m[2]}`;
}

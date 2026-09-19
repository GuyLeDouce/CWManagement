import { DateTime } from 'luxon';
import { ensure } from './errors';
export const DEFAULT_ZONE = 'America/Toronto';
export function normalizeZone(zone: string | null | undefined, fallback = DEFAULT_ZONE) {
  return zone?.trim() || fallback.trim() || DEFAULT_ZONE;
}
export function validZone(zone: string) {
  if (!zone || !DateTime.now().setZone(zone).isValid) return false;
  try {
    // Luxon also accepts values such as UTC-04:00 that browser date rendering rejects.
    new Intl.DateTimeFormat('en-CA', { timeZone: zone }).format();
    return true;
  } catch {
    return false;
  }
}
export function paidStart(actual: Date, earliest: string, zone: string): Date {
  ensure(
    /^([01]\d|2[0-3]):[0-5]\d$/.test(earliest) && validZone(zone),
    'Invalid start time or timezone.',
  );
  const local = DateTime.fromJSDate(actual, { zone });
  const [hour, minute] = earliest.split(':').map(Number);
  const floor = local.set({ hour, minute, second: 0, millisecond: 0 }).toJSDate();
  return new Date(Math.max(actual.getTime(), floor.getTime()));
}
export function dateKey(date: Date, zone: string) {
  return DateTime.fromJSDate(date, { zone }).toISODate()!;
}
export function previousWeek(now: Date, zone: string) {
  const end = DateTime.fromJSDate(now, { zone }).startOf('week');
  return { start: end.minus({ weeks: 1 }).toJSDate(), end: end.toJSDate() };
}
export function dateRange(from: string, to: string, zone: string) {
  const start = DateTime.fromISO(from, { zone }).startOf('day');
  const end = DateTime.fromISO(to, { zone }).startOf('day').plus({ days: 1 });
  ensure(
    /^\d{4}-\d{2}-\d{2}$/.test(from) &&
      /^\d{4}-\d{2}-\d{2}$/.test(to) &&
      start.isValid &&
      end.isValid &&
      end > start &&
      end.diff(start, 'days').days <= 367,
    'Choose a valid date range of no more than one year.',
  );
  return { start: start.toJSDate(), end: end.toJSDate() };
}
export function durationMs(start: Date, end: Date) {
  return Math.max(0, end.getTime() - start.getTime());
}
export function clippedMs(start: Date, end: Date, from: Date, to: Date) {
  return durationMs(new Date(Math.max(+start, +from)), new Date(Math.min(+end, +to)));
}
// Sum integer milliseconds first; round only the final presentation, never each line.
export function hours(ms: number): string {
  return (Math.round(ms / 360) / 10000).toFixed(4);
}
export function overlaps(a: { start: Date; end: Date }, b: { start: Date; end: Date }) {
  return +a.end > +a.start && +b.end > +b.start && a.start < b.end && b.start < a.end;
}
export function splitAtMidnights(start: Date, end: Date, zone: string) {
  ensure(end >= start, 'End time must follow start time.');
  const parts: { start: Date; end: Date }[] = [];
  let cursor = start;
  while (cursor < end) {
    const midnight = DateTime.fromJSDate(cursor, { zone })
      .startOf('day')
      .plus({ days: 1 })
      .toJSDate();
    const next = new Date(Math.min(+midnight, +end));
    parts.push({ start: cursor, end: next });
    cursor = next;
  }
  return parts.length ? parts : [{ start, end }];
}
export type WorkType = 'SHOP' | 'SITE' | 'OFFICE' | 'TRAVEL';
export function nextType(
  current: WorkType,
  sameJob: boolean,
  action: 'SWITCH' | 'ARRIVED',
): WorkType {
  if (action === 'ARRIVED') {
    ensure(current === 'TRAVEL', 'You are not travelling.');
    return 'SITE';
  }
  ensure(current !== 'TRAVEL', 'Scan the truck QR and select ARRIVED first.');
  return current === 'SITE' && !sameJob ? 'TRAVEL' : current;
}

// Editing an accounting code must not silently round a recorded timestamp to a minute.
export function correctionTimestamp(localValue: string, original: string, zone: string) {
  const displayed = DateTime.fromISO(original).setZone(zone).toFormat("yyyy-MM-dd'T'HH:mm:ss");
  if (
    localValue === displayed ||
    (localValue === displayed.slice(0, 16) && displayed.endsWith(':00'))
  )
    return original;
  const parsed = DateTime.fromISO(localValue, { zone });
  ensure(parsed.isValid, 'Enter a valid local time.');
  const roundTrip = parsed.toFormat(
    localValue.length === 16 ? "yyyy-MM-dd'T'HH:mm" : "yyyy-MM-dd'T'HH:mm:ss",
  );
  ensure(
    roundTrip === localValue,
    'This local time does not exist because of a daylight-saving change.',
  );
  return parsed.toISO()!;
}
export function hasCurrentApproval(record: {
  status: string;
  version: number;
  approvals: { segmentVersion: number }[];
}) {
  return (
    ['PM_APPROVED', 'EXPORTED'].includes(record.status) &&
    record.approvals.some((a) => a.segmentVersion === record.version)
  );
}

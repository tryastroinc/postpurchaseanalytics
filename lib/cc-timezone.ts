// ─────────────────────────────────────────────────────────────────────────────
// Checkout Champ timezone constant — used everywhere CC dates are formatted.
// CC operates in the merchant's configured timezone (EST for our account).
// ─────────────────────────────────────────────────────────────────────────────

export const CC_TIMEZONE = "America/New_York";

export function ccDateFmt(d: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: CC_TIMEZONE,
    year: "numeric",
    month: "numeric",
    day: "numeric",
  }).formatToParts(d);
  const get = (type: string) => parts.find((p) => p.type === type)!.value;
  return `${get("month")}/${get("day")}/${get("year")}`;
}

// EST calendar date as YYYY-MM-DD for a given instant (for matching CC's day to
// our UTC-stamped ab_flow_logs rows).
export function ccDateYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: CC_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

// UTC instant for a wall-clock time (YYYY-MM-DD + HH:MM:SS) interpreted in
// CC_TIMEZONE. Handles DST. Use to convert an EST calendar day into the UTC
// ISO bounds an ab_flow_logs created_at filter needs.
export function ccZonedToUtc(ymd: string, hms: string): Date {
  const guess = new Date(`${ymd}T${hms}Z`);
  const tz = new Date(guess.toLocaleString("en-US", { timeZone: CC_TIMEZONE }));
  const utc = new Date(guess.toLocaleString("en-US", { timeZone: "UTC" }));
  return new Date(guess.getTime() + (utc.getTime() - tz.getTime()));
}

// Returns today and yesterday as CC-formatted date strings in EST.
// No Date object gymnastics — just the strings CC needs.
export function estDayBoundsCC(): {
  todayCc: string;
  yesterdayCc: string;
} {
  const now = new Date();
  const todayCc = ccDateFmt(now);
  const yesterday = new Date(now.getTime() - 86400000);
  const yesterdayCc = ccDateFmt(yesterday);
  return { todayCc, yesterdayCc };
}

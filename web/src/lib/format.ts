import { formatUnits, parseUnits } from "viem";
import { IMD_DECIMALS } from "../config";

/** Integer-only token display: viem's formatUnits works on bigint strings, never floats. */
export function formatIMD(v: bigint): string {
  const s = formatUnits(v, IMD_DECIMALS);
  const [i, f] = s.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return f ? `${grouped}.${f}` : grouped;
}

export function formatETH(wei: bigint): string {
  // Gas estimates: show up to 6 decimals, rounded up so the estimate never understates.
  const unit = 10n ** 12n;
  const micro = (wei + unit - 1n) / unit;
  const whole = micro / 1_000_000n;
  const frac = (micro % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  return frac ? `${whole}.${frac}` : whole.toString();
}

export const MAX_QUANTITY = 10_000n;

/** Whole copies only: digits, 1 to MAX_QUANTITY. Returns null when the text is not a valid quantity. */
export function parseQuantity(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d{1,6}$/.test(t)) return null;
  const q = BigInt(t);
  if (q < 1n || q > MAX_QUANTITY) return null;
  return q;
}

/** Decimal IMD text to base units, with at most 18 decimals and no exponent notation. */
export function parseIMDAmount(text: string): bigint | null {
  const t = text.trim();
  if (!/^\d+(\.\d{1,18})?$/.test(t)) return null;
  const v = parseUnits(t, IMD_DECIMALS);
  return v > 0n ? v : null;
}

export const shortAddress = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Editorial dates are Unix seconds, conventionally midnight UTC; shown as the UTC calendar date. */
export function editorialDate(ts: bigint, withDay = false): string {
  const d = new Date(Number(ts) * 1000);
  if (Number.isNaN(d.getTime())) return "Undated";
  const base = `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}, ${d.getUTCFullYear()}`;
  return withDay ? `${DAYS[d.getUTCDay()]}, ${base}` : base;
}

export function isoDate(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** yyyy-mm-dd from a date input to midnight UTC in Unix seconds. */
export function dateInputToTimestamp(v: string): bigint | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v);
  if (!m) return null;
  const ms = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  if (Number.isNaN(ms) || ms < 0) return null;
  const back = new Date(ms).toISOString().slice(0, 10);
  if (back !== v) return null;
  return BigInt(ms / 1000);
}

export function dateTime(ts: bigint): string {
  const d = new Date(Number(ts) * 1000);
  return `${editorialDate(ts)}, ${d.toISOString().slice(11, 16)} UTC`;
}

/** h:mm:ss remaining, from whole seconds. */
export function countdown(seconds: bigint): string {
  if (seconds <= 0n) return "0:00:00";
  const h = seconds / 3600n;
  const m = (seconds % 3600n) / 60n;
  const s = seconds % 60n;
  return `${h}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

export const plural = (n: bigint, one: string, many: string) => `${n.toString()} ${n === 1n ? one : many}`;

/**
 * Safe alternatives to Number.toFixed() for Hermes (React Native).
 * Hermes has a known bug where toFixed() throws
 * "unrecognized format() type specifier '.'" on some values.
 */

/** Format a number to exactly 2 decimal places, e.g. 19.9 → "19,90" */
export function formatKr(n: number): string {
  const rounded = Math.round(n * 100);
  const intPart = Math.floor(Math.abs(rounded) / 100);
  const fracPart = String(Math.abs(rounded) % 100).padStart(2, '0');
  return `${n < 0 ? '-' : ''}${intPart},${fracPart}`;
}

/** Format a number to exactly 1 decimal place, e.g. 1.23 → "1,2" */
export function formatOneDecimal(n: number): string {
  const rounded = Math.round(n * 10);
  const intPart = Math.floor(Math.abs(rounded) / 10);
  const fracPart = Math.abs(rounded) % 10;
  return `${n < 0 ? '-' : ''}${intPart},${fracPart}`;
}

/** Format a number to exactly 4 decimal places, e.g. 59.12345 → "59,1235" */
export function formatFourDecimals(n: number): string {
  const rounded = Math.round(n * 10000);
  const intPart = Math.floor(Math.abs(rounded) / 10000);
  const fracPart = String(Math.abs(rounded) % 10000).padStart(4, '0');
  return `${n < 0 ? '-' : ''}${intPart},${fracPart}`;
}

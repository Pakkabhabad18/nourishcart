// Unit conversions. Canonical storage units: kg, cm, g, ml, INR.
// Every conversion here is explicit; the engines never guess a unit.

export const LB_PER_KG = 2.20462262;
export const CM_PER_INCH = 2.54;

export function lbToKg(lb: number): number {
  return lb / LB_PER_KG;
}

export function kgToLb(kg: number): number {
  return kg * LB_PER_KG;
}

export function ftInToCm(feet: number, inches: number): number {
  return (feet * 12 + inches) * CM_PER_INCH;
}

export function cmToFtIn(cm: number): { feet: number; inches: number } {
  const totalInches = cm / CM_PER_INCH;
  let feet = Math.floor(totalInches / 12);
  let inches = Math.round(totalInches - feet * 12);
  if (inches === 12) {
    feet += 1;
    inches = 0;
  }
  return { feet, inches };
}

/** Round to a fixed number of decimals without floating-point surprises for display. */
export function round(value: number, decimals = 0): number {
  const f = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * f) / f;
}

/** Money is handled in integer paise inside calculations to avoid float drift. */
export function toPaise(inr: number): number {
  return Math.round(inr * 100);
}

export function fromPaise(paise: number): number {
  return paise / 100;
}

export function formatInr(inr: number): string {
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(inr);
}

/**
 * Normalised unit price for comparison. Only compares like with like:
 * g -> INR per kg, ml -> INR per litre, piece -> INR per piece.
 */
export function unitPrice(priceInr: number, packQty: number, unit: 'g' | 'ml' | 'piece'): { value: number; label: string } {
  if (packQty <= 0) throw new Error('packQty must be positive');
  if (unit === 'g') return { value: round((priceInr / packQty) * 1000, 2), label: '/kg' };
  if (unit === 'ml') return { value: round((priceInr / packQty) * 1000, 2), label: '/L' };
  return { value: round(priceInr / packQty, 2), label: '/piece' };
}

/** Human-readable quantity, e.g. 1500 g -> "1.5 kg". */
export function formatQty(qty: number, unit: 'g' | 'ml' | 'piece'): string {
  if (unit === 'piece') return `${round(qty, 1)} pc`;
  if (qty >= 1000) return `${round(qty / 1000, 2)} ${unit === 'g' ? 'kg' : 'L'}`;
  return `${round(qty, 0)} ${unit}`;
}

/** Age in completed years on a given date. */
export function ageInYears(dateOfBirth: string, onDate: Date = new Date()): number {
  const dob = new Date(dateOfBirth + 'T00:00:00Z');
  if (Number.isNaN(dob.getTime())) return NaN;
  let age = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const m = onDate.getUTCMonth() - dob.getUTCMonth();
  if (m < 0 || (m === 0 && onDate.getUTCDate() < dob.getUTCDate())) age -= 1;
  return age;
}

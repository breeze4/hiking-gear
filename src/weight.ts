// Weights are stored in milligrams (matching lighterpack).
export function mgToUnit(mg: number, unit: string): number {
  switch (unit) {
    case 'g': return mg / 1000;
    case 'kg': return mg / 1_000_000;
    case 'oz': return mg / 28349.5;
    case 'lb': return mg / 453592;
    default: return mg;
  }
}

export function formatWeight(mg: number, unit: string, digits = 2): string {
  return `${mgToUnit(mg, unit).toFixed(digits)} ${unit}`;
}

export function unitToMg(value: number, unit: string): number {
  switch (unit) {
    case 'g': return value * 1000;
    case 'kg': return value * 1_000_000;
    case 'oz': return value * 28349.5;
    case 'lb': return value * 453592;
    default: return value;
  }
}

export const WEIGHT_UNITS = ['g', 'kg', 'oz', 'lb'] as const;

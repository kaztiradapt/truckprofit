export type LoadState = "UNKNOWN" | "LOADED" | "EMPTY";

export interface MileageLeg {
  readonly id: string;
  readonly startOdometerKm: number | null;
  readonly endOdometerKm: number | null;
  readonly loadState: LoadState;
  readonly completed: boolean;
}

export interface MileageResult {
  readonly totalKm: number;
  readonly loadedKm: number;
  readonly emptyKm: number;
  readonly emptyPercentage: number | null;
  readonly warnings: readonly string[];
}

export function calculateMileage(legs: readonly MileageLeg[]): MileageResult {
  let totalKm = 0;
  let loadedKm = 0;
  let emptyKm = 0;
  const warnings: string[] = [];

  for (const leg of legs) {
    if (!leg.completed) {
      warnings.push(`INCOMPLETE_LEG:${leg.id}`);
      continue;
    }
    if (leg.startOdometerKm === null || leg.endOdometerKm === null) {
      warnings.push(`MISSING_ODOMETER:${leg.id}`);
      continue;
    }
    if (!Number.isInteger(leg.startOdometerKm) || !Number.isInteger(leg.endOdometerKm)) {
      warnings.push(`INVALID_ODOMETER:${leg.id}`);
      continue;
    }
    if (leg.endOdometerKm < leg.startOdometerKm) {
      warnings.push(`NEGATIVE_MILEAGE:${leg.id}`);
      continue;
    }
    if (leg.loadState === "UNKNOWN") {
      warnings.push(`UNKNOWN_LOAD_STATE:${leg.id}`);
      continue;
    }

    const distance = leg.endOdometerKm - leg.startOdometerKm;
    totalKm += distance;
    if (leg.loadState === "LOADED") loadedKm += distance;
    if (leg.loadState === "EMPTY") emptyKm += distance;
  }

  return { totalKm, loadedKm, emptyKm, emptyPercentage: totalKm === 0 ? null : (emptyKm / totalKm) * 100, warnings };
}

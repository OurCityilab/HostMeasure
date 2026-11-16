import { MODEL_FIT } from "./model.generated";
import { ModelSpec } from "../engine/valuation";
import { RoomType } from "../types";

/**
 * Which comp model the app runs.
 *
 * scripts/calibrate.ts back-tests three candidates on the bundled data and records a
 * recommendation per room type:
 *   "handset"          the transparent 25 / 8 / 10 points and 12 per mile rule
 *   "handsetAdjusted"  the same rule plus line-item adjustments of each comp to the subject
 *   "fitted"           weights chosen by grid search plus adjustments
 * A more complex model is only recommended when it beats the simpler one out of sample by
 * at least half a percentage point of typical error. Set FORCE_MODEL to override.
 */
export type ModelChoice = "handset" | "handsetAdjusted" | "fitted";

export const FORCE_MODEL: ModelChoice | null = null;

function specFor(roomType: RoomType): { choice: ModelChoice; spec: ModelSpec } {
  const fit = MODEL_FIT[roomType];
  const choice = (FORCE_MODEL ?? fit.recommended) as ModelChoice;
  const source = fit[choice].spec;
  return {
    choice,
    spec: {
      attributes: [...source.attributes],
      weights: { ...source.weights },
      milesWeight: source.milesWeight,
      adjustments: source.adjustments ? { ...source.adjustments } : null,
      compCount: source.compCount,
      intervalScale: source.intervalScale,
    },
  };
}

export const ACTIVE_MODEL: Record<RoomType, { choice: ModelChoice; spec: ModelSpec }> = {
  entire: specFor("entire"),
  private: specFor("private"),
};

export interface ModelAccuracy {
  listingCount: number;
  /** Typical miss as a fraction, e.g. 0.168 = 16.8%. */
  typicalError: number;
  within20Pct: number;
  rangeCoverage: number;
  fittedOn: string;
}

/** Back-tested accuracy of the model the app is running, for display next to the numbers. */
export function getModelAccuracy(roomType: RoomType): ModelAccuracy {
  const fit = MODEL_FIT[roomType];
  const choice = ACTIVE_MODEL[roomType].choice;
  const m = choice === "fitted" ? fit.fitted.crossValidated : fit[choice].backtest;
  return {
    listingCount: fit.listingCount,
    typicalError: m.medianAbsPctError,
    within20Pct: m.within20Pct,
    rangeCoverage: m.rangeCoverage,
    fittedOn: MODEL_FIT.fittedOn,
  };
}

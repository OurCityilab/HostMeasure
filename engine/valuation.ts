/**
 * Valuation kernel: comparable selection, line-item adjustment, range estimation,
 * back-testing and calibration.
 *
 * Nothing in this file knows about Airbnb, React or DC. A "comparable" is any property
 * with a location, a value and numeric attributes, so the same kernel can price nightly
 * rates here and sale prices in an appraisal engine (attributes such as finished area,
 * bedrooms, bathrooms, age, lot size). Every function is pure and deterministic.
 */

export type Attributes = Record<string, number | null>;

export interface Subject {
  lat: number;
  lon: number;
  attrs: Attributes;
}

export interface Comparable extends Subject {
  id: string;
  /** The observed value being estimated: nightly rate here, sale price in an appraisal. */
  value: number;
}

/** Everything that defines how values are estimated. Fitted or hand-set, it is just data. */
export interface ModelSpec {
  /** Attributes used for similarity and adjustment, in display order. */
  attributes: string[];
  /** Similarity points lost per unit of difference in each attribute. */
  weights: Record<string, number>;
  /** Similarity points lost per mile of straight-line distance. */
  milesWeight: number;
  /**
   * Change in log(value) per unit of each attribute, used to adjust each comparable to
   * the subject. null = select comparables only, no adjustment.
   */
  adjustments: Record<string, number> | null;
  /** How many comparables are used. */
  compCount: number;
  /** Stretches the P25-P75 band around the median so it covers the actual value half the time. */
  intervalScale: number;
}

export interface RangeEstimate {
  low: number;
  expected: number;
  high: number;
}

export interface ScoredComparable<T extends Comparable = Comparable> {
  comp: T;
  score: number;
  miles: number;
  /** Absolute difference per attribute (0 when either side is unknown). */
  diffs: Record<string, number>;
}

export interface AdjustmentLine {
  attribute: string;
  subjectValue: number;
  compValue: number;
  /** Fractional change applied to the comparable's value for this line, e.g. 0.14 = +14%. */
  pct: number;
  /** Dollar effect of this line taken on its own against the unadjusted value. */
  amount: number;
}

export interface AdjustedComparable {
  rawValue: number;
  adjustedValue: number;
  /** Combined multiplier across all lines. */
  multiplier: number;
  lines: AdjustmentLine[];
}

const EARTH_RADIUS_MILES = 3958.7613;
const RAD = Math.PI / 180;

export function distanceMiles(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = (lat2 - lat1) * RAD;
  const dLon = (lon2 - lon1) * RAD;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * RAD) * Math.cos(lat2 * RAD) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function known(v: number | null | undefined): v is number {
  return v !== null && v !== undefined && Number.isFinite(v);
}

/** Similarity score: 100 minus weighted differences, floored at 0. Unknown attributes cost nothing. */
export function similarity(subject: Subject, comp: Subject, spec: ModelSpec): {
  score: number;
  miles: number;
  diffs: Record<string, number>;
} {
  const miles = distanceMiles(subject.lat, subject.lon, comp.lat, comp.lon);
  const diffs: Record<string, number> = {};
  let raw = 100 - spec.milesWeight * miles;
  for (const attr of spec.attributes) {
    const s = subject.attrs[attr];
    const c = comp.attrs[attr];
    const diff = known(s) && known(c) ? Math.abs(s - c) : 0;
    diffs[attr] = diff;
    raw -= (spec.weights[attr] ?? 0) * diff;
  }
  return { score: Math.max(0, raw), miles, diffs };
}

/** Highest score first; ties broken by id so the same inputs always give the same list. */
export function compareScored(a: { score: number; comp: { id: string } }, b: { score: number; comp: { id: string } }): number {
  if (b.score !== a.score) return b.score - a.score;
  return a.comp.id < b.comp.id ? -1 : a.comp.id > b.comp.id ? 1 : 0;
}

export function selectComparables<T extends Comparable>(
  subject: Subject,
  pool: readonly T[],
  spec: ModelSpec,
  limit: number = spec.compCount
): ScoredComparable<T>[] {
  const scored = pool.map((comp) => ({ comp, ...similarity(subject, comp, spec) }));
  scored.sort(compareScored);
  return scored.slice(0, limit);
}

/**
 * Adjust one comparable to the subject, one attribute at a time: a comparable that is
 * larger than the subject is adjusted down, a smaller one up. Multiplicative, so the
 * lines compound; `multiplier` is the exact combined effect.
 */
export function adjustComparable(subject: Subject, comp: Comparable, spec: ModelSpec): AdjustedComparable {
  const lines: AdjustmentLine[] = [];
  let logDelta = 0;
  if (spec.adjustments) {
    for (const attr of spec.attributes) {
      const coef = spec.adjustments[attr];
      const s = subject.attrs[attr];
      const c = comp.attrs[attr];
      if (!coef || !known(s) || !known(c) || s === c) continue;
      const delta = coef * (s - c);
      logDelta += delta;
      const pct = Math.exp(delta) - 1;
      lines.push({ attribute: attr, subjectValue: s, compValue: c, pct, amount: comp.value * pct });
    }
  }
  const multiplier = Math.exp(logDelta);
  return { rawValue: comp.value, adjustedValue: comp.value * multiplier, multiplier, lines };
}

/** Percentile with linear interpolation (p in 0..1). */
export function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const pos = (sorted.length - 1) * p;
  const base = Math.floor(pos);
  const next = sorted[base + 1];
  return next === undefined ? sorted[base] : sorted[base] + (pos - base) * (next - sorted[base]);
}

/** Median with a P25-P75 band stretched by intervalScale (1 = the plain quartiles). */
export function estimateRange(values: readonly number[], intervalScale = 1): RangeEstimate {
  if (values.length === 0) return { low: 0, expected: 0, high: 0 };
  const expected = percentile(values, 0.5);
  const q1 = percentile(values, 0.25);
  const q3 = percentile(values, 0.75);
  return {
    low: Math.max(0, expected - intervalScale * (expected - q1)),
    expected,
    high: expected + intervalScale * (q3 - expected),
  };
}

/** Estimate a subject's value from a pool: select, adjust, summarize. */
export function estimateValue<T extends Comparable>(subject: Subject, pool: readonly T[], spec: ModelSpec): {
  range: RangeEstimate;
  comps: Array<ScoredComparable<T> & { adjusted: AdjustedComparable }>;
} {
  const comps = selectComparables(subject, pool, spec).map((c) => ({
    ...c,
    adjusted: adjustComparable(subject, c.comp, spec),
  }));
  return { range: estimateRange(comps.map((c) => c.adjusted.adjustedValue), spec.intervalScale), comps };
}

/* ------------------------------------------------------------------ fitting */

/** Solve A x = b by Gaussian elimination with partial pivoting. A is small (attributes + 1). */
function solveLinear(A: number[][], b: number[]): number[] {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) if (Math.abs(M[r][col]) > Math.abs(M[pivot][col])) pivot = r;
    if (Math.abs(M[pivot][col]) < 1e-12) continue;
    [M[col], M[pivot]] = [M[pivot], M[col]];
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = M[r][col] / M[col][col];
      if (f === 0) continue;
      for (let c = col; c <= n; c++) M[r][c] -= f * M[col][c];
    }
  }
  return M.map((row, i) => (Math.abs(row[i]) < 1e-12 ? 0 : row[n] / row[i]));
}

function medianOfKnown(pool: readonly Comparable[], attr: string): number {
  const vals = pool.map((c) => c.attrs[attr]).filter(known);
  return vals.length ? percentile(vals, 0.5) : 0;
}

/**
 * Fit the adjustment coefficients by ordinary least squares on log(value):
 * log(value) = b0 + sum(b_attr * attr). Unknown attributes are filled with the median.
 * Each coefficient is the market's implied percentage change per unit of that attribute.
 */
export function fitAdjustments(pool: readonly Comparable[], attributes: readonly string[]): Record<string, number> {
  const k = attributes.length + 1;
  const fill = attributes.map((a) => medianOfKnown(pool, a));
  const XtX = Array.from({ length: k }, () => new Array<number>(k).fill(0));
  const Xty = new Array<number>(k).fill(0);
  const row = new Array<number>(k).fill(1);
  for (const comp of pool) {
    if (!(comp.value > 0)) continue;
    for (let j = 0; j < attributes.length; j++) {
      const v = comp.attrs[attributes[j]];
      row[j + 1] = known(v) ? v : fill[j];
    }
    const y = Math.log(comp.value);
    for (let a = 0; a < k; a++) {
      Xty[a] += row[a] * y;
      for (let b = 0; b < k; b++) XtX[a][b] += row[a] * row[b];
    }
  }
  const beta = solveLinear(XtX, Xty);
  const out: Record<string, number> = {};
  attributes.forEach((a, j) => (out[a] = beta[j + 1]));
  return out;
}

/* --------------------------------------------------------------- back-test */

export interface BacktestMetrics {
  count: number;
  /** Median absolute percentage error: the typical miss. */
  medianAbsPctError: number;
  meanAbsPctError: number;
  within10Pct: number;
  within20Pct: number;
  /** Median signed error: positive = the engine predicts too high. */
  medianBiasPct: number;
  /** Share of actual values inside the low-high band. 0.5 is the target. */
  rangeCoverage: number;
}

export interface BacktestPrediction {
  id: string;
  actual: number;
  predicted: number;
  low: number;
  high: number;
  /** How many of the comparables scored 50 or more. */
  strongComps: number;
}

export interface BacktestReport {
  overall: BacktestMetrics;
  /** Metrics split by a caller-supplied grouping, e.g. bedroom count. */
  segments: Record<string, BacktestMetrics>;
  predictions: BacktestPrediction[];
}

export function summarizePredictions(preds: readonly BacktestPrediction[]): BacktestMetrics {
  const n = preds.length;
  if (n === 0) {
    return { count: 0, medianAbsPctError: 0, meanAbsPctError: 0, within10Pct: 0, within20Pct: 0, medianBiasPct: 0, rangeCoverage: 0 };
  }
  const signed = preds.map((p) => (p.predicted - p.actual) / p.actual);
  const abs = signed.map(Math.abs);
  return {
    count: n,
    medianAbsPctError: percentile(abs, 0.5),
    meanAbsPctError: abs.reduce((s, v) => s + v, 0) / n,
    within10Pct: abs.filter((v) => v <= 0.1).length / n,
    within20Pct: abs.filter((v) => v <= 0.2).length / n,
    medianBiasPct: percentile(signed, 0.5),
    rangeCoverage: preds.filter((p) => p.actual >= p.low && p.actual <= p.high).length / n,
  };
}

/** Stable fold assignment from the id, so a back-test can be reproduced exactly. */
export function foldOf(id: string, folds: number): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0) % folds;
}

export interface BacktestOptions {
  /** Number of cross-validation folds for anything fitted (default 5). */
  folds?: number;
  /**
   * When true, adjustment coefficients are re-fitted on the other folds before each
   * fold is predicted, so no property helps set the coefficients used on itself.
   * When false, spec.adjustments is used as given.
   */
  refitAdjustments?: boolean;
  /** Group label for the segment table, e.g. (c) => `${c.attrs.bedrooms} bed`. */
  segmentBy?: (comp: Comparable) => string;
}

/**
 * Leave-one-out back-test. Each property is hidden in turn, valued from the rest of the
 * pool, and compared with its actual value.
 */
export function backtest(pool: readonly Comparable[], spec: ModelSpec, options: BacktestOptions = {}): BacktestReport {
  const folds = options.folds ?? 5;
  const n = pool.length;
  const k = Math.min(spec.compCount, Math.max(0, n - 1));
  const attrs = spec.attributes;
  const fold = pool.map((c) => foldOf(c.id, folds));

  // Per-fold adjustment coefficients
  const coefByFold: Array<Record<string, number> | null> = [];
  for (let f = 0; f < folds; f++) {
    if (!spec.adjustments) coefByFold.push(null);
    else if (options.refitAdjustments) coefByFold.push(fitAdjustments(pool.filter((_, i) => fold[i] !== f), attrs));
    else coefByFold.push(spec.adjustments);
  }

  const lat = Float64Array.from(pool, (c) => c.lat * RAD);
  const lon = Float64Array.from(pool, (c) => c.lon * RAD);
  const cosLat = lat.map(Math.cos);
  const cols = attrs.map((a) => Float64Array.from(pool, (c) => (known(c.attrs[a]) ? (c.attrs[a] as number) : NaN)));
  const w = attrs.map((a) => spec.weights[a] ?? 0);

  const topIdx = new Int32Array(k);
  const topScore = new Float64Array(k);
  const predictions: BacktestPrediction[] = [];

  for (let i = 0; i < n; i++) {
    let filled = 0;
    for (let j = 0; j < n; j++) {
      if (j === i) continue;
      const sLat = Math.sin((lat[j] - lat[i]) / 2);
      const sLon = Math.sin((lon[j] - lon[i]) / 2);
      const h = sLat * sLat + cosLat[i] * cosLat[j] * sLon * sLon;
      let score = 100 - spec.milesWeight * 2 * EARTH_RADIUS_MILES * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
      for (let a = 0; a < cols.length; a++) {
        const d = cols[a][i] - cols[a][j];
        if (d === d) score -= w[a] * (d < 0 ? -d : d);
      }
      if (score < 0) score = 0;
      // Keep the best k, ordered by score desc then id asc
      if (filled === k) {
        const last = filled - 1;
        if (score < topScore[last] || (score === topScore[last] && pool[j].id > pool[topIdx[last]].id)) continue;
      }
      let pos = filled < k ? filled : k - 1;
      while (pos > 0 && (topScore[pos - 1] < score || (topScore[pos - 1] === score && pool[topIdx[pos - 1]].id > pool[j].id))) {
        topScore[pos] = topScore[pos - 1];
        topIdx[pos] = topIdx[pos - 1];
        pos--;
      }
      topScore[pos] = score;
      topIdx[pos] = j;
      if (filled < k) filled++;
    }

    const coef = coefByFold[fold[i]];
    const values: number[] = [];
    let strong = 0;
    for (let t = 0; t < filled; t++) {
      const j = topIdx[t];
      if (topScore[t] >= 50) strong++;
      let logDelta = 0;
      if (coef) {
        for (let a = 0; a < cols.length; a++) {
          const d = cols[a][i] - cols[a][j];
          logDelta += (coef[attrs[a]] ?? 0) * d;
        }
      }
      values.push(pool[j].value * Math.exp(logDelta));
    }
    const range = estimateRange(values, spec.intervalScale);
    predictions.push({ id: pool[i].id, actual: pool[i].value, predicted: range.expected, low: range.low, high: range.high, strongComps: strong });
  }

  const segments: Record<string, BacktestMetrics> = {};
  if (options.segmentBy) {
    const groups = new Map<string, BacktestPrediction[]>();
    pool.forEach((c, i) => {
      const key = options.segmentBy!(c);
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(predictions[i]);
    });
    for (const [key, list] of groups) segments[key] = summarizePredictions(list);
  }

  return { overall: summarizePredictions(predictions), segments, predictions };
}

/* -------------------------------------------------------------- calibration */

export interface CalibrationGrid {
  /** Candidate values per attribute weight. */
  weights: Record<string, number[]>;
  milesWeight: number[];
}

export interface CalibrationResult {
  /** Spec fitted on the full pool: best weights, fitted adjustments, calibrated interval scale. */
  spec: ModelSpec;
  /**
   * Honest out-of-sample accuracy: for each fold, weights were chosen using only the other
   * folds, then scored on the held-out fold. This is the number to quote.
   */
  crossValidated: BacktestMetrics;
  /** In-sample accuracy of the final spec, for comparison. Always a little flattering. */
  inSample: BacktestMetrics;
  candidatesTried: number;
}

function cartesian(grid: CalibrationGrid, attributes: readonly string[]): Array<{ weights: Record<string, number>; milesWeight: number }> {
  let combos: Array<{ weights: Record<string, number>; milesWeight: number }> = grid.milesWeight.map((m) => ({ weights: {}, milesWeight: m }));
  for (const attr of attributes) {
    const next: typeof combos = [];
    for (const c of combos) for (const v of grid.weights[attr] ?? [0]) next.push({ weights: { ...c.weights, [attr]: v }, milesWeight: c.milesWeight });
    combos = next;
  }
  return combos;
}

/** Smallest interval scale (step 0.05) at which the band covers at least half the actual values. */
export function calibrateIntervalScale(pool: readonly Comparable[], spec: ModelSpec, options: BacktestOptions = {}): number {
  const base = backtest(pool, { ...spec, intervalScale: 1 }, options).predictions;
  for (let scale = 1; scale <= 2.0001; scale += 0.05) {
    const covered = base.filter((p) => {
      const low = p.predicted - scale * (p.predicted - p.low);
      const high = p.predicted + scale * (p.high - p.predicted);
      return p.actual >= low && p.actual <= high;
    }).length;
    if (covered / base.length >= 0.5) return Math.round(scale * 100) / 100;
  }
  return 2;
}

/**
 * Choose similarity weights by grid search to minimize the typical back-test error,
 * fit the adjustment coefficients, and calibrate the range width.
 */
export function calibrate(
  pool: readonly Comparable[],
  base: ModelSpec,
  grid: CalibrationGrid,
  options: { folds?: number; adjust?: boolean; onProgress?: (done: number, total: number) => void } = {}
): CalibrationResult {
  const folds = options.folds ?? 5;
  const adjust = options.adjust ?? true;
  const candidates = cartesian(grid, base.attributes);
  const fold = pool.map((c) => foldOf(c.id, folds));
  const placeholder = adjust ? fitAdjustments(pool, base.attributes) : null;

  // One back-test per candidate; errors are reused for every fold's selection.
  const absErr: Float64Array[] = [];
  const runs: BacktestPrediction[][] = [];
  candidates.forEach((cand, idx) => {
    const spec: ModelSpec = { ...base, ...cand, adjustments: placeholder, intervalScale: 1 };
    const preds = backtest(pool, spec, { folds, refitAdjustments: adjust }).predictions;
    runs.push(preds);
    absErr.push(Float64Array.from(preds, (p) => Math.abs(p.predicted - p.actual) / p.actual));
    options.onProgress?.(idx + 1, candidates.length);
  });

  const medianOver = (errs: Float64Array, keep: (i: number) => boolean): number => {
    const vals: number[] = [];
    for (let i = 0; i < errs.length; i++) if (keep(i)) vals.push(errs[i]);
    return percentile(vals, 0.5);
  };
  const bestFor = (keep: (i: number) => boolean): number => {
    let best = 0;
    let bestErr = Infinity;
    absErr.forEach((errs, idx) => {
      const e = medianOver(errs, keep);
      if (e < bestErr - 1e-12) {
        bestErr = e;
        best = idx;
      }
    });
    return best;
  };

  // Nested cross-validation: pick on the training folds, score on the held-out fold.
  const heldOut: BacktestPrediction[] = new Array(pool.length);
  for (let f = 0; f < folds; f++) {
    const pick = bestFor((i) => fold[i] !== f);
    for (let i = 0; i < pool.length; i++) if (fold[i] === f) heldOut[i] = runs[pick][i];
  }

  const finalPick = bestFor(() => true);
  const fitted: ModelSpec = { ...base, ...candidates[finalPick], adjustments: placeholder, intervalScale: 1 };
  fitted.intervalScale = calibrateIntervalScale(pool, fitted, { folds, refitAdjustments: adjust });

  // Apply the calibrated band to the held-out predictions so coverage is reported honestly.
  const scale = fitted.intervalScale;
  const heldOutScaled = heldOut.map((p) => ({
    ...p,
    low: p.predicted - scale * (p.predicted - p.low),
    high: p.predicted + scale * (p.high - p.predicted),
  }));

  return {
    spec: fitted,
    crossValidated: summarizePredictions(heldOutScaled),
    inSample: backtest(pool, fitted, { folds, refitAdjustments: adjust }).overall,
    candidatesTried: candidates.length,
  };
}

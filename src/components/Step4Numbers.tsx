import React, { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Check,
  Copy,
  FileText,
  Info,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { DC_RULES } from "../../config/dcRules";
import { buildDeterministicExplanation } from "../../engine/revenueModel";
import {
  CostAssumptions,
  DualPathComparison,
  EligibilityEvaluation,
  HomeProfile,
  PathFinancials,
} from "../../types";

interface Step4NumbersProps {
  home: HomeProfile;
  eligibility: EligibilityEvaluation;
  comparison: DualPathComparison;
  assumptions: CostAssumptions;
  onChangeAssumptions: (updated: Partial<CostAssumptions>) => void;
  onResetAssumptions: () => void;
  onOpenAuditDrawer: () => void;
}

function formatUsd(val: number): string {
  const rounded = Math.round(val);
  if (rounded < 0) {
    return `-$${Math.abs(rounded).toLocaleString()}`;
  }
  return `$${rounded.toLocaleString()}`;
}

export const Step4Numbers: React.FC<Step4NumbersProps> = ({
  home,
  eligibility,
  comparison,
  assumptions,
  onChangeAssumptions,
  onResetAssumptions,
  onOpenAuditDrawer,
}) => {
  const [tornadoPath, setTornadoPath] = useState<"pathA" | "pathB">("pathA");
  const [explanationText, setExplanationText] = useState<string | null>(null);
  const [explanationSource, setExplanationSource] = useState<
    "gemini" | "template" | null
  >(null);
  const [isExplaining, setIsExplaining] = useState<boolean>(false);
  const [copiedSummary, setCopiedSummary] = useState<boolean>(false);

  const { pathA, pathB } = comparison;

  // Max price across both paths for scaling the visual range bars
  const maxRateScale = Math.max(
    500,
    pathA.nightlyRate.high * 1.15,
    pathB.nightlyRate.high * 1.15
  );

  const handleExplainResult = async () => {
    setIsExplaining(true);
    try {
      const payload = {
        eligibilityStatus: eligibility.status,
        betterPath: comparison.betterPathTitle,
        expectedNetDifferenceUsd: Math.round(comparison.netAdvantage.expected),
        pathA: {
          name: pathA.pathTitle,
          compCount: pathA.compCount,
          nightlyRateUsd: {
            p25: Math.round(pathA.nightlyRate.low),
            median: Math.round(pathA.nightlyRate.expected),
            p75: Math.round(pathA.nightlyRate.high),
          },
          estimatedMarketDemandNights: {
            p25: Math.round(pathA.demandNights.low),
            median: Math.round(pathA.demandNights.expected),
            p75: Math.round(pathA.demandNights.high),
          },
          bookableNights: {
            conservative: Math.round(pathA.bookableNights.low),
            expected: Math.round(pathA.bookableNights.expected),
            optimistic: Math.round(pathA.bookableNights.high),
          },
          bindingLimit: pathA.bindingLimitLabel,
          grossIncomeUsd: {
            conservative: Math.round(pathA.grossIncome.low),
            expected: Math.round(pathA.grossIncome.expected),
            optimistic: Math.round(pathA.grossIncome.high),
          },
          totalCostsUsd: {
            conservative: Math.round(pathA.costs.totalCosts.low),
            expected: Math.round(pathA.costs.totalCosts.expected),
            optimistic: Math.round(pathA.costs.totalCosts.high),
          },
          netIncomeUsd: {
            conservative: Math.round(pathA.netIncome.low),
            expected: Math.round(pathA.netIncome.expected),
            optimistic: Math.round(pathA.netIncome.high),
          },
        },
        pathB: {
          name: pathB.pathTitle,
          compCount: pathB.compCount,
          nightlyRateUsd: {
            p25: Math.round(pathB.nightlyRate.low),
            median: Math.round(pathB.nightlyRate.expected),
            p75: Math.round(pathB.nightlyRate.high),
          },
          estimatedMarketDemandNights: {
            p25: Math.round(pathB.demandNights.low),
            median: Math.round(pathB.demandNights.expected),
            p75: Math.round(pathB.demandNights.high),
          },
          bookableNights: {
            conservative: Math.round(pathB.bookableNights.low),
            expected: Math.round(pathB.bookableNights.expected),
            optimistic: Math.round(pathB.bookableNights.high),
          },
          bindingLimit: pathB.bindingLimitLabel,
          grossIncomeUsd: {
            conservative: Math.round(pathB.grossIncome.low),
            expected: Math.round(pathB.grossIncome.expected),
            optimistic: Math.round(pathB.grossIncome.high),
          },
          totalCostsUsd: {
            conservative: Math.round(pathB.costs.totalCosts.low),
            expected: Math.round(pathB.costs.totalCosts.expected),
            optimistic: Math.round(pathB.costs.totalCosts.high),
          },
          netIncomeUsd: {
            conservative: Math.round(pathB.netIncome.low),
            expected: Math.round(pathB.netIncome.expected),
            optimistic: Math.round(pathB.netIncome.high),
          },
        },
      };

      const response = await fetch("/api/explain-result", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }

      const data = await response.json();
      if (data && typeof data.explanation === "string" && data.explanation.trim()) {
        setExplanationText(data.explanation.trim());
        setExplanationSource("gemini");
      } else {
        throw new Error("Invalid response payload");
      }
    } catch {
      const fallback = buildDeterministicExplanation(
        comparison,
        eligibility.status
      );
      setExplanationText(fallback);
      setExplanationSource("template");
    } finally {
      setIsExplaining(false);
    }
  };

  const buildPlainTextSummary = (): string => {
    const lines = [
      `HostMeasure DC — Summary for ${home.neighbourhood}`,
      `Home Profile: ${home.bedrooms} BR, ${home.bathrooms} BA, sleeps ${home.guests}, ${home.nightsAvailable} nights/yr available`,
      `Eligibility: ${eligibility.headline} (${DC_RULES.disclaimerText}, verified ${DC_RULES.lastVerified})`,
      `Verdict: ${comparison.verdictSummary}`,
      ``,
      `PATH A: ${pathA.pathTitle} (${pathA.compCount} comparable homes)`,
      `  Nightly Rate Range (P25 / Median / P75): ${formatUsd(pathA.nightlyRate.low)} / ${formatUsd(pathA.nightlyRate.expected)} / ${formatUsd(pathA.nightlyRate.high)}`,
      `  Estimated Demand Range: ${Math.round(pathA.demandNights.low)} / ${Math.round(pathA.demandNights.expected)} / ${Math.round(pathA.demandNights.high)} nights`,
      `  Bookable Nights: ${Math.round(pathA.bookableNights.low)} / ${Math.round(pathA.bookableNights.expected)} / ${Math.round(pathA.bookableNights.high)} (${pathA.bindingLimitLabel})`,
      `  Gross Income: ${formatUsd(pathA.grossIncome.low)} (conservative) | ${formatUsd(pathA.grossIncome.expected)} (expected) | ${formatUsd(pathA.grossIncome.high)} (optimistic)`,
      `  Total Annual Costs (incl. owner time): ${formatUsd(pathA.costs.totalCosts.expected)} expected`,
      `  Net Income: ${formatUsd(pathA.netIncome.low)} (conservative) | ${formatUsd(pathA.netIncome.expected)} (expected) | ${formatUsd(pathA.netIncome.high)} (optimistic)`,
      `  Net Per Hour of Owner Time: ${formatUsd(pathA.netPerHour.expected)}/hr after $30/hr baseline (${formatUsd(pathA.cashNetPerHour.expected)}/hr cash)`,
      `  Break-Even: ${Math.round(pathA.breakEvenNights.expected)} nights/year`,
      ``,
      `PATH B: ${pathB.pathTitle} (${pathB.compCount} comparable homes)`,
      `  Nightly Rate Range (P25 / Median / P75): ${formatUsd(pathB.nightlyRate.low)} / ${formatUsd(pathB.nightlyRate.expected)} / ${formatUsd(pathB.nightlyRate.high)}`,
      `  Estimated Demand Range: ${Math.round(pathB.demandNights.low)} / ${Math.round(pathB.demandNights.expected)} / ${Math.round(pathB.demandNights.high)} nights`,
      `  Bookable Nights: ${Math.round(pathB.bookableNights.low)} / ${Math.round(pathB.bookableNights.expected)} / ${Math.round(pathB.bookableNights.high)} (${pathB.bindingLimitLabel})`,
      `  Gross Income: ${formatUsd(pathB.grossIncome.low)} (conservative) | ${formatUsd(pathB.grossIncome.expected)} (expected) | ${formatUsd(pathB.grossIncome.high)} (optimistic)`,
      `  Total Annual Costs (incl. owner time): ${formatUsd(pathB.costs.totalCosts.expected)} expected`,
      `  Net Income: ${formatUsd(pathB.netIncome.low)} (conservative) | ${formatUsd(pathB.netIncome.expected)} (expected) | ${formatUsd(pathB.netIncome.high)} (optimistic)`,
      `  Net Per Hour of Owner Time: ${formatUsd(pathB.netPerHour.expected)}/hr after $30/hr baseline (${formatUsd(pathB.cashNetPerHour.expected)}/hr cash)`,
      `  Break-Even: ${Math.round(pathB.breakEvenNights.expected)} nights/year`,
      ``,
      `Source: Inside Airbnb, Sept 20 2026 snapshot, 3,271 active short-term listings. Estimate only, not legal or tax advice.`,
    ];
    return lines.join("\n");
  };

  const handleCopySummary = async () => {
    try {
      await navigator.clipboard.writeText(buildPlainTextSummary());
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    } catch {
      // Fallback copy via temporary textarea
      const textarea = document.createElement("textarea");
      textarea.value = buildPlainTextSummary();
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopiedSummary(true);
      setTimeout(() => setCopiedSummary(false), 2500);
    }
  };

  // Grouped Bar Chart data (Gross, Costs, Net for both paths)
  const groupedChartData = [
    {
      name: "Path A: Whole Home",
      Gross: Math.round(pathA.grossIncome.expected),
      Costs: Math.round(pathA.costs.totalCosts.expected),
      Net: Math.round(pathA.netIncome.expected),
    },
    {
      name: "Path B: Private Room",
      Gross: Math.round(pathB.grossIncome.expected),
      Costs: Math.round(pathB.costs.totalCosts.expected),
      Net: Math.round(pathB.netIncome.expected),
    },
  ];

  // Tornado Sensitivity Chart data
  const activeSensitivity =
    tornadoPath === "pathA"
      ? comparison.sensitivityPathA
      : comparison.sensitivityPathB;

  const tornadoChartData = activeSensitivity.map((item) => ({
    name: item.label,
    minus20Delta: Math.round(item.deltaFromBase.low),
    plus20Delta: Math.round(item.deltaFromBase.high),
    swing: Math.round(item.swing),
    lowInputLabel: item.lowInputLabel,
    highInputLabel: item.highInputLabel,
  }));

  const renderPathCard = (path: PathFinancials, isWinner: boolean) => {
    const rateLowPct = Math.min(
      100,
      Math.max(0, (path.nightlyRate.low / maxRateScale) * 100)
    );
    const rateMedPct = Math.min(
      100,
      Math.max(0, (path.nightlyRate.expected / maxRateScale) * 100)
    );
    const rateHighPct = Math.min(
      100,
      Math.max(rateLowPct + 4, (path.nightlyRate.high / maxRateScale) * 100)
    );

    const maxBarNights = 365;
    const demandPct = Math.min(
      100,
      (path.demandNights.expected / maxBarNights) * 100
    );
    const ownerPct = Math.min(
      100,
      (path.ownerAvailableNights.expected / maxBarNights) * 100
    );
    const capPct = Math.min(
      100,
      (path.effectiveLegalCapForMath / maxBarNights) * 100
    );

    return (
      <div
        key={path.pathId}
        className={`rounded-xl border p-6 space-y-6 flex flex-col justify-between ${
          isWinner
            ? "border-emerald-800 bg-emerald-50/20"
            : "border-slate-200 bg-white"
        }`}
      >
        <div className="space-y-5">
          {/* Card Header */}
          <div className="pb-4 border-b border-slate-200">
            <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
              <span className="font-semibold text-emerald-900">
                {path.pathId === "pathA" ? "PATH A" : "PATH B"} ·{" "}
                {path.licenseTypeLabel}
              </span>
              {isWinner && (
                <span className="font-semibold text-emerald-800">
                  Higher Expected Net
                </span>
              )}
            </div>
            <h3 className="text-xl font-bold text-slate-900 mt-1">
              {path.pathTitle}
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">{path.pathSubtitle}</p>
          </div>

          {/* 1. Nightly Rate Range Bar (P25 / Median / P75) */}
          <div className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Nightly Rate Range ({path.compCount} homes)
              </span>
              <span className="text-xs font-mono tabular-nums text-slate-600">
                P25{" "}
                <strong className="text-slate-900">
                  ${Math.round(path.nightlyRate.low)}
                </strong>{" "}
                · Median{" "}
                <strong className="text-emerald-900 text-sm">
                  ${Math.round(path.nightlyRate.expected)}
                </strong>{" "}
                · P75{" "}
                <strong className="text-slate-900">
                  ${Math.round(path.nightlyRate.high)}
                </strong>
              </span>
            </div>

            {/* Visual Range Bar */}
            <div className="relative h-7 bg-slate-100 rounded-lg border border-slate-200 overflow-hidden">
              <div
                className="absolute top-1.5 bottom-1.5 bg-emerald-700/25 border border-emerald-700/60 rounded"
                style={{
                  left: `${rateLowPct}%`,
                  width: `${Math.max(3, rateHighPct - rateLowPct)}%`,
                }}
              />
              <div
                className="absolute top-0.5 bottom-0.5 w-1 bg-emerald-900 rounded"
                style={{ left: `${rateMedPct}%` }}
                title={`Median: $${Math.round(path.nightlyRate.expected)}/night`}
              />
            </div>
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>Conservative (P25): ${Math.round(path.nightlyRate.low)}</span>
              <span>Median: ${Math.round(path.nightlyRate.expected)}</span>
              <span>Optimistic (P75): ${Math.round(path.nightlyRate.high)}</span>
            </div>

            {Math.abs(path.conditionRateEffect.expected) >= 0.5 ? (
              <div className="p-2 rounded-lg bg-emerald-50/70 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-emerald-950 font-medium">
                    Relative Condition Adjustment Applied:
                  </span>
                  {path.coverOnlyAdjustedCount > 0 && (
                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-semibold">
                      Cover photo only · low confidence
                    </span>
                  )}
                </div>
                <span className="font-mono tabular-nums text-emerald-900 font-semibold">
                  {path.conditionRateEffect.expected >= 0 ? "+" : "-"}$
                  {Math.abs(Math.round(path.conditionRateEffect.expected))}/nt (Raw $
                  {Math.round(path.unadjustedNightlyRate.expected)} → $
                  {Math.round(path.nightlyRate.expected)}) ·{" "}
                  {path.conditionNetEffect.expected >= 0 ? "+" : ""}
                  {formatUsd(path.conditionNetEffect.expected)}/yr net
                </span>
              </div>
            ) : path.coverOnlyAdjustedCount > 0 ? (
              <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                <span className="text-slate-700 font-medium">
                  Cover photo only · low confidence · not used
                </span>
                <span className="font-mono tabular-nums text-slate-500">
                  No price adjustment applied
                </span>
              </div>
            ) : null}
          </div>

          {/* 2. Estimated Demand Range */}
          <div className="pt-2 border-t border-slate-100 flex items-baseline justify-between text-xs">
            <span className="font-semibold text-slate-700">
              Estimated Market Demand (LTM)
            </span>
            <span className="font-mono tabular-nums text-slate-800">
              P25 <strong>{Math.round(path.demandNights.low)}</strong> · Median{" "}
              <strong className="text-emerald-900">
                {Math.round(path.demandNights.expected)}
              </strong>{" "}
              · P75 <strong>{Math.round(path.demandNights.high)}</strong>{" "}
              <span className="text-slate-500 font-sans">estimated nights</span>
            </span>
          </div>

          {/* 3. Bookable Nights & Binding Limit (3 Bars) */}
          <div className="pt-3 border-t border-slate-100 space-y-2.5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-700">
                Bookable Nights (Smallest of 3 Limits)
              </span>
              <span className="text-xs font-mono tabular-nums font-bold text-emerald-900">
                {Math.round(path.bookableNights.low)} /{" "}
                {Math.round(path.bookableNights.expected)} /{" "}
                {Math.round(path.bookableNights.high)} nights
              </span>
            </div>

            <div className="space-y-2 text-xs">
              {/* Bar 1: Market Demand */}
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span
                    className={
                      path.bindingLimit === "market_demand"
                        ? "font-bold text-emerald-900"
                        : "text-slate-600"
                    }
                  >
                    1. Estimated market demand (median)
                  </span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {Math.round(path.demandNights.expected)} nights (estimated)
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      path.bindingLimit === "market_demand"
                        ? "bg-emerald-800"
                        : "bg-slate-400"
                    }`}
                    style={{ width: `${demandPct}%` }}
                  />
                </div>
              </div>

              {/* Bar 2: Owner Availability */}
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span
                    className={
                      path.bindingLimit === "owner_nights"
                        ? "font-bold text-emerald-900"
                        : "text-slate-600"
                    }
                  >
                    2. Nights you can host
                  </span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {Math.round(path.ownerAvailableNights.expected)} nights
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      path.bindingLimit === "owner_nights"
                        ? "bg-emerald-800"
                        : "bg-slate-400"
                    }`}
                    style={{ width: `${ownerPct}%` }}
                  />
                </div>
              </div>

              {/* Bar 3: Legal Cap */}
              <div>
                <div className="flex justify-between text-[11px] mb-0.5">
                  <span
                    className={
                      path.bindingLimit === "legal_cap"
                        ? "font-bold text-emerald-900"
                        : "text-slate-600"
                    }
                  >
                    3. DC annual legal cap
                  </span>
                  <span className="font-mono tabular-nums text-slate-800">
                    {path.legalCapNights !== null
                      ? `${path.legalCapNights} nights (hard cap)`
                      : "365 nights (no annual cap)"}
                  </span>
                </div>
                <div className="w-full h-2.5 bg-slate-100 rounded overflow-hidden">
                  <div
                    className={`h-full rounded ${
                      path.bindingLimit === "legal_cap"
                        ? "bg-emerald-800"
                        : "bg-slate-400"
                    }`}
                    style={{ width: `${capPct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-100 text-xs font-semibold text-slate-900 flex items-center justify-between gap-2">
              <span>{path.bindingLimitLabel}</span>
              <span className="text-[11px] font-normal text-slate-500 shrink-0">
                {DC_RULES.disclaimerText} ({DC_RULES.lastVerified})
              </span>
            </div>
          </div>

          {/* 4. Gross Income Range */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="text-xs font-semibold text-slate-700">
              Annual Gross Income (Before Costs)
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Conservative</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {formatUsd(path.grossIncome.low)}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-400">
                  P25 × {Math.round(path.bookableNights.low)}n
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-white border border-slate-300">
                <div className="text-[11px] font-semibold text-slate-700">
                  Expected
                </div>
                <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
                  {formatUsd(path.grossIncome.expected)}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-500">
                  Med × {Math.round(path.bookableNights.expected)}n
                </div>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Optimistic</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {formatUsd(path.grossIncome.high)}
                </div>
                <div className="text-[10px] font-mono tabular-nums text-slate-400">
                  P75 × {Math.round(path.bookableNights.high)}n
                </div>
              </div>
            </div>
          </div>

          {/* 5. Net Income Range (After All Costs & Owner Time) */}
          <div className="pt-3 border-t border-slate-100 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-slate-900">
                Annual Net Income (After Costs &amp; Owner Time)
              </span>
              <span className="font-mono tabular-nums text-slate-500">
                Expected costs: {formatUsd(path.costs.totalCosts.expected)}/yr
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Conservative</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {formatUsd(path.netIncome.low)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-emerald-900 text-white">
                <div className="text-[11px] text-emerald-100 font-medium">
                  Expected Net
                </div>
                <div className="text-lg font-bold font-mono tabular-nums mt-0.5">
                  {formatUsd(path.netIncome.expected)}
                </div>
              </div>
              <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                <div className="text-[11px] text-slate-500">Optimistic</div>
                <div className="text-sm font-bold font-mono tabular-nums text-slate-800 mt-0.5">
                  {formatUsd(path.netIncome.high)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* 6. Net Per Hour & Break-Even Footer */}
        <div className="pt-4 border-t border-slate-200 grid grid-cols-2 gap-4 text-xs">
          <div>
            <div className="text-slate-500">Net per hour of your time</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {formatUsd(path.cashNetPerHour.expected)}/hr{" "}
              <span className="text-xs font-normal text-slate-500">cash</span>
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              ({formatUsd(path.netPerHour.expected)}/hr after $
              {assumptions.ownerHourlyRate}/hr time cost ·{" "}
              {Math.round(path.ownerHoursPerYear.expected)} hrs/yr)
            </div>
          </div>

          <div>
            <div className="text-slate-500">Break-even nights per year</div>
            <div className="text-base font-bold font-mono tabular-nums text-slate-900 mt-0.5">
              {Math.round(path.breakEvenNights.expected)} nights / yr
            </div>
            <div className="text-[11px] font-mono tabular-nums text-slate-500">
              Range: {Math.round(path.breakEvenNights.low)}–
              {Math.round(path.breakEvenNights.high)} nights to cover fixed costs
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <section
      id="step-4"
      className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-6 md:p-8 space-y-8"
    >
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-3 pb-6 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide">
            04. Step Four
          </span>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
            My Numbers: Realistic Earnings &amp; Costs
          </h2>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={onOpenAuditDrawer}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FileText className="w-3.5 h-3.5 text-emerald-800" />
            How we got this
          </button>
          <button
            type="button"
            onClick={handleCopySummary}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-800 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedSummary ? (
              <>
                <Check className="w-3.5 h-3.5 text-emerald-800" />
                Copied summary
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5 text-slate-600" />
                Copy summary
              </>
            )}
          </button>
        </div>
      </div>

      {/* Informational-Only Warning if Not Primary Residence */}
      {eligibility.status === "ineligible" && (
        <div className="rounded-xl border border-red-200 bg-red-50/80 p-4 flex items-center gap-3 text-xs font-semibold text-red-950">
          <Info className="w-4 h-4 text-red-700 shrink-0" />
          <span>
            Informational Only: Because you indicated this is not your primary residence, DC rules do not allow short-term rental licensing for this property.
          </span>
        </div>
      )}

      {/* Verdict Banner */}
      <div className="rounded-xl border border-emerald-800 bg-emerald-950 text-white p-6 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
        <div className="space-y-1.5">
          <div className="text-xs font-semibold text-emerald-300 tracking-wide">
            Bottom-Line Verdict (After Operating Costs &amp; Owner Time)
          </div>
          <h3 className="text-xl md:text-2xl font-bold text-balance">
            {comparison.verdictSummary}
          </h3>
          <p className="text-xs text-emerald-200">
            Before deducting the imputed value of your own time ($
            {assumptions.ownerHourlyRate}/hr), expected cash net is{" "}
            <strong className="font-mono tabular-nums text-white">
              {formatUsd(pathA.cashNetIncome.expected)}/yr
            </strong>{" "}
            for Path A vs.{" "}
            <strong className="font-mono tabular-nums text-white">
              {formatUsd(pathB.cashNetIncome.expected)}/yr
            </strong>{" "}
            for Path B.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={handleExplainResult}
            disabled={isExplaining}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-xs font-semibold bg-white text-emerald-950 hover:bg-emerald-50 rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0 disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4 text-emerald-800" />
            {isExplaining ? "Writing plain-English verdict..." : "Explain my result"}
          </button>
        </div>
      </div>

      {/* Plain-English Verdict Output (from Gemini or Deterministic Template Fallback) */}
      {explanationText && (
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-5 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-500">
            <span className="font-semibold text-slate-900">
              Plain-English Verdict
            </span>
            <span>
              {explanationSource === "gemini"
                ? "Generated from your computed numbers"
                : "Built from your computed numbers"}
            </span>
          </div>
          <p className="text-sm text-slate-800 leading-relaxed">
            {explanationText}
          </p>
        </div>
      )}

      {/* Side-by-Side Path Cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-stretch">
        {renderPathCard(pathA, comparison.betterPathId === "pathA")}
        {renderPathCard(pathB, comparison.betterPathId === "pathB")}
      </div>

      {/* Editable Cost Sliders (Tagged "your assumption", not market data) */}
      <div className="rounded-xl border border-slate-200 p-6 bg-slate-50/40 space-y-6">
        <div className="flex flex-wrap items-baseline justify-between gap-2 pb-4 border-b border-slate-200">
          <div>
            <h3 className="text-lg font-bold text-slate-900">
              Operating Cost &amp; Time Assumptions
            </h3>
            <p className="text-xs text-slate-600 mt-0.5">
              Every slider below is tagged <strong className="text-slate-900">your assumption</strong> (not market data). Adjust any slider to see how net income and the winning path change live.
            </p>
          </div>
          <button
            type="button"
            onClick={onResetAssumptions}
            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-800 hover:text-emerald-950 underline cursor-pointer whitespace-nowrap shrink-0"
          >
            <RotateCcw className="w-3 h-3" />
            Reset to default assumptions
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* 1. Airbnb Host Fee */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-host-fee" className="font-semibold text-slate-800">
                Airbnb host fee · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {assumptions.hostFeePercent}%
              </span>
            </div>
            <input
              id="slider-host-fee"
              type="range"
              min={0}
              max={15}
              step={0.5}
              value={assumptions.hostFeePercent}
              onChange={(e) =>
                onChangeAssumptions({ hostFeePercent: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 2. Average Stay Nights */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-avg-stay" className="font-semibold text-slate-800">
                Average stay · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {assumptions.averageStayNights} nights
              </span>
            </div>
            <input
              id="slider-avg-stay"
              type="range"
              min={1}
              max={14}
              step={0.5}
              value={assumptions.averageStayNights}
              onChange={(e) =>
                onChangeAssumptions({
                  averageStayNights: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 3. Cleaning per Stay, Whole Home */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-cleaning-home" className="font-semibold text-slate-800">
                Cleaning per stay, whole home · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.cleaningPerStay}
              </span>
            </div>
            <input
              id="slider-cleaning-home"
              type="range"
              min={0}
              max={300}
              step={5}
              value={assumptions.cleaningPerStay}
              onChange={(e) =>
                onChangeAssumptions({ cleaningPerStay: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 3b. Cleaning per Stay, Private Room */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-cleaning-room" className="font-semibold text-slate-800">
                Cleaning per stay, private room · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.cleaningPerStayRoom}
              </span>
            </div>
            <input
              id="slider-cleaning-room"
              type="range"
              min={0}
              max={200}
              step={5}
              value={assumptions.cleaningPerStayRoom}
              onChange={(e) =>
                onChangeAssumptions({
                  cleaningPerStayRoom: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 4. Supplies per Stay */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-supplies" className="font-semibold text-slate-800">
                Supplies per stay · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.suppliesPerStay}
              </span>
            </div>
            <input
              id="slider-supplies"
              type="range"
              min={0}
              max={60}
              step={1}
              value={assumptions.suppliesPerStay}
              onChange={(e) =>
                onChangeAssumptions({ suppliesPerStay: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 5. Extra Insurance per Year */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-insurance" className="font-semibold text-slate-800">
                Extra insurance/yr · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.extraInsurancePerYear}/yr
              </span>
            </div>
            <input
              id="slider-insurance"
              type="range"
              min={0}
              max={2000}
              step={50}
              value={assumptions.extraInsurancePerYear}
              onChange={(e) =>
                onChangeAssumptions({
                  extraInsurancePerYear: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 6. Extra Utilities per Night */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-utilities" className="font-semibold text-slate-800">
                Extra utilities/night · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.extraUtilitiesPerNight}/nt
              </span>
            </div>
            <input
              id="slider-utilities"
              type="range"
              min={0}
              max={25}
              step={1}
              value={assumptions.extraUtilitiesPerNight}
              onChange={(e) =>
                onChangeAssumptions({
                  extraUtilitiesPerNight: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 7. Owner Hours per Stay */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-owner-hours" className="font-semibold text-slate-800">
                Owner time/stay · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                {assumptions.ownerHoursPerStay} hrs/stay
              </span>
            </div>
            <input
              id="slider-owner-hours"
              type="range"
              min={0}
              max={8}
              step={0.5}
              value={assumptions.ownerHoursPerStay}
              onChange={(e) =>
                onChangeAssumptions({
                  ownerHoursPerStay: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 8. Owner Hourly Rate */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-owner-rate" className="font-semibold text-slate-800">
                Owner hourly rate · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.ownerHourlyRate}/hr
              </span>
            </div>
            <input
              id="slider-owner-rate"
              type="range"
              min={0}
              max={100}
              step={5}
              value={assumptions.ownerHourlyRate}
              onChange={(e) =>
                onChangeAssumptions({ ownerHourlyRate: Number(e.target.value) })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>

          {/* 9. One-time Setup Spread Over 3 Years */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slider-setup-cost" className="font-semibold text-slate-800">
                Setup (over 3 yrs) · <span className="font-normal text-slate-500">your assumption</span>
              </label>
              <span className="font-mono tabular-nums font-bold text-slate-900">
                ${assumptions.oneTimeSetupCost.toLocaleString()} ($
                {Math.round(
                  assumptions.oneTimeSetupCost /
                    assumptions.setupAmortizationYears
                )}
                /yr)
              </span>
            </div>
            <input
              id="slider-setup-cost"
              type="range"
              min={0}
              max={10000}
              step={250}
              value={assumptions.oneTimeSetupCost}
              onChange={(e) =>
                onChangeAssumptions({
                  oneTimeSetupCost: Number(e.target.value),
                })
              }
              className="w-full h-1.5 bg-slate-200 rounded-lg cursor-pointer"
            />
          </div>
        </div>

        {/* Fixed Rule Callout: License Fee & Lodging Tax */}
        <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs text-slate-600">
          <div>
            <strong>DC License Fee:</strong> ${assumptions.licenseFeeTwoYear} for 2 years ($
            {(assumptions.licenseFeeTwoYear / 2).toFixed(2)}/yr included in costs) ·{" "}
            <strong>DC Lodging Tax:</strong> {DC_RULES.lodgingTax.ratePercent}% paid by the guest &amp; collected by Airbnb (informational only; not subtracted from host income).
          </div>
          <div className="text-slate-500 shrink-0">
            {DC_RULES.disclaimerText} · Verified {DC_RULES.lastVerified}
          </div>
        </div>
      </div>

      {/* Charts Row: Grouped Bar Chart & Sensitivity Tornado Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 pt-2">
        {/* Left: Grouped Bar Chart (Gross, Costs, Net) */}
        <div className="lg:col-span-5 rounded-xl border border-slate-200 p-5 space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Expected Gross, Costs &amp; Net by Path
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Annual comparison at median rate and expected bookable nights.
            </p>
          </div>
          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={groupedChartData}
                margin={{ top: 10, right: 10, left: 10, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 12, fill: "#334155" }}
                />
                <YAxis
                  tickFormatter={(v) => `$${(v / 1000).toFixed(0)}k`}
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <Tooltip
                  formatter={(value: unknown) => [
                    formatUsd(Number(value)),
                    "",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                  }}
                />
                <Legend wrapperStyle={{ fontSize: "12px" }} />
                <Bar dataKey="Gross" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Costs" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Net" fill="#065f46" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right: Tornado Sensitivity Chart ("What changes the answer most") */}
        <div className="lg:col-span-7 rounded-xl border border-slate-200 p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                What Changes the Answer Most (±20% Sensitivity Tornado)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Ranked by how much moving each input down 20% or up 20% changes expected net income.
              </p>
            </div>
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setTornadoPath("pathA")}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tornadoPath === "pathA"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Path A Tornado
              </button>
              <button
                type="button"
                onClick={() => setTornadoPath("pathB")}
                className={`px-2.5 py-1 text-xs font-semibold rounded transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  tornadoPath === "pathB"
                    ? "bg-white text-slate-900 shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                Path B Tornado
              </button>
            </div>
          </div>

          <div className="h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                layout="vertical"
                data={tornadoChartData}
                margin={{ top: 5, right: 25, left: 30, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis
                  type="number"
                  tickFormatter={(v) =>
                    `${v >= 0 ? "+" : "-"}$${Math.abs(v).toLocaleString()}`
                  }
                  tick={{ fontSize: 11, fill: "#64748b" }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={135}
                  tick={{ fontSize: 11, fill: "#1e293b" }}
                />
                <Tooltip
                  formatter={(value: unknown, name: unknown) => [
                    `${Number(value) >= 0 ? "+" : ""}${formatUsd(
                      Number(value)
                    )}`,
                    name === "minus20Delta"
                      ? "Input -20% effect"
                      : "Input +20% effect",
                  ]}
                  contentStyle={{
                    borderRadius: "8px",
                    border: "1px solid #cbd5e1",
                    fontSize: "12px",
                  }}
                />
                <Legend
                  formatter={(value) =>
                    value === "minus20Delta"
                      ? "Input reduced by 20%"
                      : "Input increased by 20%"
                  }
                  wrapperStyle={{ fontSize: "12px" }}
                />
                <ReferenceLine x={0} stroke="#0f172a" strokeWidth={1.5} />
                <Bar dataKey="minus20Delta" fill="#64748b" radius={[2, 2, 2, 2]}>
                  {tornadoChartData.map((entry, idx) => (
                    <Cell
                      key={`cell-m-${idx}`}
                      fill={entry.minus20Delta >= 0 ? "#059669" : "#94a3b8"}
                    />
                  ))}
                </Bar>
                <Bar dataKey="plus20Delta" fill="#065f46" radius={[2, 2, 2, 2]}>
                  {tornadoChartData.map((entry, idx) => (
                    <Cell
                      key={`cell-p-${idx}`}
                      fill={entry.plus20Delta >= 0 ? "#065f46" : "#94a3b8"}
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </section>
  );
};

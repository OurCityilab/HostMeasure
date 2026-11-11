import { DC_RULES } from "../config/dcRules";
import {
  BindingLimitType,
  CompSelectionResult,
  CostAssumptions,
  CostBreakdown,
  DualPathComparison,
  HomeProfile,
  PathFinancials,
  RangeValue,
  SensitivityItem,
} from "../types";
import { computeRangeFromValues } from "./compEngine";

/**
 * Helper to create a constant { low, expected, high } RangeValue
 */
export function constantRange(value: number): RangeValue {
  return { low: value, expected: value, high: value };
}

/**
 * Determine which constraint binds at the expected (median) level.
 */
export function determineBindingLimit(
  expectedDemand: number,
  ownerNightsAvailable: number,
  legalCapNights: number | null
): {
  bindingLimit: BindingLimitType;
  bindingLimitLabel: string;
} {
  const effectiveCap = legalCapNights ?? 365;
  const minVal = Math.min(expectedDemand, ownerNightsAvailable, effectiveCap);

  if (legalCapNights !== null && effectiveCap <= expectedDemand && effectiveCap <= ownerNightsAvailable && minVal === effectiveCap) {
    return {
      bindingLimit: "legal_cap",
      bindingLimitLabel: `The ${legalCapNights}-night legal cap is what limits you.`,
    };
  }

  if (ownerNightsAvailable <= expectedDemand && ownerNightsAvailable <= effectiveCap) {
    return {
      bindingLimit: "owner_nights",
      bindingLimitLabel: `Your ${ownerNightsAvailable}-night availability is what limits you.`,
    };
  }

  return {
    bindingLimit: "market_demand",
    bindingLimitLabel: `Estimated market demand (${Math.round(expectedDemand)} nights) is what limits you.`,
  };
}

/**
 * Calculate detailed outcome for a single scenario point (given price, bookable nights, and cost assumptions).
 */
interface PointOutcome {
  gross: number;
  stays: number;
  ownerHours: number;
  airbnbFee: number;
  cleaning: number;
  supplies: number;
  utilities: number;
  ownerTimeCost: number;
  insuranceAnnual: number;
  setupAnnualized: number;
  licenseAnnualized: number;
  cashCosts: number;
  totalCosts: number;
  cashNet: number;
  net: number;
  netPerHour: number;
  cashNetPerHour: number;
  breakEvenNights: number;
}

export function computeScenarioPoint(
  nightlyPrice: number,
  bookableNights: number,
  assumptions: CostAssumptions,
  isPathB: boolean = false
): PointOutcome {
  const nights = Math.max(0, bookableNights);
  const price = Math.max(0, nightlyPrice);
  const avgStay = Math.max(1, assumptions.averageStayNights);

  const gross = price * nights;
  const stays = nights > 0 ? nights / avgStay : 0;
  const ownerHours = stays * Math.max(0, assumptions.ownerHoursPerStay);

  const airbnbFee = gross * (Math.max(0, assumptions.hostFeePercent) / 100);
  const cleaningRate = isPathB
    ? (assumptions.cleaningPerStayRoom ?? 50)
    : assumptions.cleaningPerStay;
  const cleaning = stays * Math.max(0, cleaningRate);
  const supplies = stays * Math.max(0, assumptions.suppliesPerStay);
  const utilities = nights * Math.max(0, assumptions.extraUtilitiesPerNight);
  const ownerTimeCost = ownerHours * Math.max(0, assumptions.ownerHourlyRate);

  const insuranceAnnual = Math.max(0, assumptions.extraInsurancePerYear);
  const setupAnnualized =
    Math.max(0, assumptions.oneTimeSetupCost) /
    Math.max(1, assumptions.setupAmortizationYears);
  const licenseAnnualized =
    Math.max(0, assumptions.licenseFeeTwoYear) /
    DC_RULES.licenseFee.durationYears;

  const fixedCosts = insuranceAnnual + setupAnnualized + licenseAnnualized;
  const cashCosts =
    airbnbFee + cleaning + supplies + utilities + fixedCosts;
  const totalCosts = cashCosts + ownerTimeCost;

  const cashNet = gross - cashCosts;
  const net = gross - totalCosts;

  const netPerHour = ownerHours > 0 ? net / ownerHours : 0;
  const cashNetPerHour = ownerHours > 0 ? cashNet / ownerHours : 0;

  // Break-even nights per year: fixedAnnualCosts / contributionMarginPerNight
  const variablePerNight =
    price * (Math.max(0, assumptions.hostFeePercent) / 100) +
    (Math.max(0, cleaningRate) +
      Math.max(0, assumptions.suppliesPerStay) +
      Math.max(0, assumptions.ownerHoursPerStay) *
        Math.max(0, assumptions.ownerHourlyRate)) /
      avgStay +
    Math.max(0, assumptions.extraUtilitiesPerNight);

  const contributionPerNight = price - variablePerNight;
  const breakEvenNights =
    contributionPerNight > 0
      ? Math.ceil(fixedCosts / contributionPerNight)
      : 365;

  return {
    gross,
    stays,
    ownerHours,
    airbnbFee,
    cleaning,
    supplies,
    utilities,
    ownerTimeCost,
    insuranceAnnual,
    setupAnnualized,
    licenseAnnualized,
    cashCosts,
    totalCosts,
    cashNet,
    net,
    netPerHour,
    cashNetPerHour,
    breakEvenNights,
  };
}

/**
 * Compute full financials for a single path (Path A or Path B) given its selected comps,
 * homeowner profile, and cost assumptions.
 */
export function calculatePathFinancials(params: {
  pathId: "pathA" | "pathB";
  compSelection: CompSelectionResult;
  home: HomeProfile;
  assumptions: CostAssumptions;
}): PathFinancials {
  const { pathId, compSelection, home, assumptions } = params;
  const { comps, isThinMarket } = compSelection;

  const isPathA = pathId === "pathA";
  const isPathB = pathId === "pathB";
  const legalCapNights = isPathA
    ? DC_RULES.vacationRental.annualNightCap
    : DC_RULES.hostedShortTermRental.annualNightCap;
  const effectiveLegalCapForMath = legalCapNights ?? 365;

  const nightlyRate = computeRangeFromValues(comps.map((c) => c.price));
  const unadjustedNightlyRate =
    compSelection.unadjustedNightlyRate ??
    computeRangeFromValues(comps.map((c) => c.rawPrice ?? c.price));
  const conditionRateEffect: RangeValue = compSelection.conditionRateEffect ?? {
    low: nightlyRate.low - unadjustedNightlyRate.low,
    expected: nightlyRate.expected - unadjustedNightlyRate.expected,
    high: nightlyRate.high - unadjustedNightlyRate.high,
  };
  const demandNights = computeRangeFromValues(
    comps.map((c) => c.est_nights_ltm)
  );

  const ownerAvail = Math.max(0, Math.min(365, home.nightsAvailable));
  const ownerAvailableNights = constantRange(ownerAvail);
  const legalCapRange = constantRange(effectiveLegalCapForMath);

  const bookableNights: RangeValue = {
    low: Math.min(demandNights.low, ownerAvail, effectiveLegalCapForMath),
    expected: Math.min(
      demandNights.expected,
      ownerAvail,
      effectiveLegalCapForMath
    ),
    high: Math.min(demandNights.high, ownerAvail, effectiveLegalCapForMath),
  };

  const { bindingLimit, bindingLimitLabel } = determineBindingLimit(
    demandNights.expected,
    ownerAvail,
    legalCapNights
  );

  const lowOutcome = computeScenarioPoint(
    nightlyRate.low,
    bookableNights.low,
    assumptions,
    isPathB
  );
  const expectedOutcome = computeScenarioPoint(
    nightlyRate.expected,
    bookableNights.expected,
    assumptions,
    isPathB
  );
  const highOutcome = computeScenarioPoint(
    nightlyRate.high,
    bookableNights.high,
    assumptions,
    isPathB
  );

  const unadjustedLowOutcome = computeScenarioPoint(
    unadjustedNightlyRate.low,
    bookableNights.low,
    assumptions,
    isPathB
  );
  const unadjustedExpectedOutcome = computeScenarioPoint(
    unadjustedNightlyRate.expected,
    bookableNights.expected,
    assumptions,
    isPathB
  );
  const unadjustedHighOutcome = computeScenarioPoint(
    unadjustedNightlyRate.high,
    bookableNights.high,
    assumptions,
    isPathB
  );

  const conditionNetEffect: RangeValue = {
    low: lowOutcome.net - unadjustedLowOutcome.net,
    expected: expectedOutcome.net - unadjustedExpectedOutcome.net,
    high: highOutcome.net - unadjustedHighOutcome.net,
  };

  const costs: CostBreakdown = {
    airbnbFee: {
      low: lowOutcome.airbnbFee,
      expected: expectedOutcome.airbnbFee,
      high: highOutcome.airbnbFee,
    },
    cleaning: {
      low: lowOutcome.cleaning,
      expected: expectedOutcome.cleaning,
      high: highOutcome.cleaning,
    },
    supplies: {
      low: lowOutcome.supplies,
      expected: expectedOutcome.supplies,
      high: highOutcome.supplies,
    },
    utilities: {
      low: lowOutcome.utilities,
      expected: expectedOutcome.utilities,
      high: highOutcome.utilities,
    },
    ownerTimeCost: {
      low: lowOutcome.ownerTimeCost,
      expected: expectedOutcome.ownerTimeCost,
      high: highOutcome.ownerTimeCost,
    },
    insuranceAnnual: {
      low: lowOutcome.insuranceAnnual,
      expected: expectedOutcome.insuranceAnnual,
      high: highOutcome.insuranceAnnual,
    },
    setupAnnualized: {
      low: lowOutcome.setupAnnualized,
      expected: expectedOutcome.setupAnnualized,
      high: highOutcome.setupAnnualized,
    },
    licenseAnnualized: {
      low: lowOutcome.licenseAnnualized,
      expected: expectedOutcome.licenseAnnualized,
      high: highOutcome.licenseAnnualized,
    },
    cashCosts: {
      low: lowOutcome.cashCosts,
      expected: expectedOutcome.cashCosts,
      high: highOutcome.cashCosts,
    },
    totalCosts: {
      low: lowOutcome.totalCosts,
      expected: expectedOutcome.totalCosts,
      high: highOutcome.totalCosts,
    },
  };

  // Note: break-even nights is lower when nightly rate is higher (optimistic), and higher when nightly rate is lower (conservative)
  const breakEvenNights: RangeValue = {
    low: highOutcome.breakEvenNights,
    expected: expectedOutcome.breakEvenNights,
    high: lowOutcome.breakEvenNights,
  };

  return {
    pathId,
    pathTitle: isPathA
      ? "Whole home while I'm away"
      : "A private room while I'm home",
    pathSubtitle: isPathA
      ? "Entire home · Vacation Rental license · 90-night annual legal cap"
      : "1 BR / 1 BA for 2 guests · Hosted STR license · No annual legal cap",
    licenseTypeLabel: isPathA
      ? DC_RULES.vacationRental.name
      : DC_RULES.hostedShortTermRental.name,
    roomType: isPathA ? "entire" : "private",
    legalCapNights,
    effectiveLegalCapForMath,
    compCount: comps.length,
    adjustedCompCount: compSelection.adjustedCompCount ?? 0,
    coverOnlyAdjustedCount: compSelection.coverOnlyAdjustedCount ?? 0,
    isThinMarket,
    nightlyRate,
    unadjustedNightlyRate,
    conditionRateEffect,
    conditionNetEffect,
    demandNights,
    ownerAvailableNights,
    legalCapRange,
    bookableNights,
    bindingLimit,
    bindingLimitLabel,
    staysPerYear: {
      low: lowOutcome.stays,
      expected: expectedOutcome.stays,
      high: highOutcome.stays,
    },
    ownerHoursPerYear: {
      low: lowOutcome.ownerHours,
      expected: expectedOutcome.ownerHours,
      high: highOutcome.ownerHours,
    },
    grossIncome: {
      low: lowOutcome.gross,
      expected: expectedOutcome.gross,
      high: highOutcome.gross,
    },
    costs,
    cashNetIncome: {
      low: lowOutcome.cashNet,
      expected: expectedOutcome.cashNet,
      high: highOutcome.cashNet,
    },
    netIncome: {
      low: lowOutcome.net,
      expected: expectedOutcome.net,
      high: highOutcome.net,
    },
    netPerHour: {
      low: lowOutcome.netPerHour,
      expected: expectedOutcome.netPerHour,
      high: highOutcome.netPerHour,
    },
    cashNetPerHour: {
      low: lowOutcome.cashNetPerHour,
      expected: expectedOutcome.cashNetPerHour,
      high: highOutcome.cashNetPerHour,
    },
    breakEvenNights,
  };
}

/**
 * Tornado sensitivity analysis ("What changes the answer most"):
 * Moves each input up and down 20% and ranks the effect on expected net income.
 */
export function calculateSensitivityTornado(
  path: PathFinancials,
  home: HomeProfile,
  assumptions: CostAssumptions
): SensitivityItem[] {
  const isPathB = path.pathId === "pathB";
  const baseExpectedNet = path.netIncome.expected;
  const basePrice = path.nightlyRate.expected;
  const baseDemand = path.demandNights.expected;
  const baseOwnerNights = home.nightsAvailable;
  const cap = path.effectiveLegalCapForMath;

  const evalWithOverrides = (
    priceOverride: number,
    demandOverride: number,
    ownerNightsOverride: number,
    customAssumptions: CostAssumptions
  ): number => {
    const bookable = Math.min(
      Math.max(0, demandOverride),
      Math.max(0, Math.min(365, ownerNightsOverride)),
      cap
    );
    return computeScenarioPoint(
      priceOverride,
      bookable,
      customAssumptions,
      isPathB
    ).net;
  };

  const baseCleaningCost = isPathB
    ? (assumptions.cleaningPerStayRoom ?? 50)
    : assumptions.cleaningPerStay;

  const candidates: Array<{
    id: string;
    label: string;
    baseValueLabel: string;
    lowInputLabel: string;
    highInputLabel: string;
    netAtMinus20: number;
    netAtPlus20: number;
  }> = [
    {
      id: "nightly_rate",
      label: "Nightly rate",
      baseValueLabel: `$${Math.round(basePrice)}/night`,
      lowInputLabel: `$${Math.round(basePrice * 0.8)}`,
      highInputLabel: `$${Math.round(basePrice * 1.2)}`,
      netAtMinus20: evalWithOverrides(
        basePrice * 0.8,
        baseDemand,
        baseOwnerNights,
        assumptions
      ),
      netAtPlus20: evalWithOverrides(
        basePrice * 1.2,
        baseDemand,
        baseOwnerNights,
        assumptions
      ),
    },
    {
      id: "owner_nights",
      label: "Nights you can host",
      baseValueLabel: `${baseOwnerNights} nights`,
      lowInputLabel: `${Math.round(baseOwnerNights * 0.8)}n`,
      highInputLabel: `${Math.min(365, Math.round(baseOwnerNights * 1.2))}n`,
      netAtMinus20: evalWithOverrides(
        basePrice,
        baseDemand,
        baseOwnerNights * 0.8,
        assumptions
      ),
      netAtPlus20: evalWithOverrides(
        basePrice,
        baseDemand,
        baseOwnerNights * 1.2,
        assumptions
      ),
    },
    {
      id: "market_demand",
      label: "Estimated market demand",
      baseValueLabel: `${Math.round(baseDemand)} nights`,
      lowInputLabel: `${Math.round(baseDemand * 0.8)}n`,
      highInputLabel: `${Math.round(baseDemand * 1.2)}n`,
      netAtMinus20: evalWithOverrides(
        basePrice,
        baseDemand * 0.8,
        baseOwnerNights,
        assumptions
      ),
      netAtPlus20: evalWithOverrides(
        basePrice,
        baseDemand * 1.2,
        baseOwnerNights,
        assumptions
      ),
    },
    {
      id: "average_stay",
      label: "Average stay length",
      baseValueLabel: `${assumptions.averageStayNights} nights`,
      lowInputLabel: `${(assumptions.averageStayNights * 0.8).toFixed(1)}n`,
      highInputLabel: `${(assumptions.averageStayNights * 1.2).toFixed(1)}n`,
      netAtMinus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        averageStayNights: assumptions.averageStayNights * 0.8,
      }),
      netAtPlus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        averageStayNights: assumptions.averageStayNights * 1.2,
      }),
    },
    {
      id: "cleaning_cost",
      label: isPathB
        ? "Cleaning per stay, private room"
        : "Cleaning per stay, whole home",
      baseValueLabel: `$${baseCleaningCost}/stay`,
      lowInputLabel: `$${Math.round(baseCleaningCost * 0.8)}`,
      highInputLabel: `$${Math.round(baseCleaningCost * 1.2)}`,
      netAtMinus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        ...(isPathB
          ? { cleaningPerStayRoom: baseCleaningCost * 0.8 }
          : { cleaningPerStay: baseCleaningCost * 0.8 }),
      }),
      netAtPlus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        ...(isPathB
          ? { cleaningPerStayRoom: baseCleaningCost * 1.2 }
          : { cleaningPerStay: baseCleaningCost * 1.2 }),
      }),
    },
    {
      id: "owner_time",
      label: "Owner time value per stay",
      baseValueLabel: `${assumptions.ownerHoursPerStay}h @ $${assumptions.ownerHourlyRate}/h`,
      lowInputLabel: `-20%`,
      highInputLabel: `+20%`,
      netAtMinus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        ownerHourlyRate: assumptions.ownerHourlyRate * 0.8,
      }),
      netAtPlus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        ownerHourlyRate: assumptions.ownerHourlyRate * 1.2,
      }),
    },
    {
      id: "setup_cost",
      label: "One-time setup cost",
      baseValueLabel: `$${assumptions.oneTimeSetupCost.toLocaleString()}`,
      lowInputLabel: `$${Math.round(assumptions.oneTimeSetupCost * 0.8).toLocaleString()}`,
      highInputLabel: `$${Math.round(assumptions.oneTimeSetupCost * 1.2).toLocaleString()}`,
      netAtMinus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        oneTimeSetupCost: assumptions.oneTimeSetupCost * 0.8,
      }),
      netAtPlus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        oneTimeSetupCost: assumptions.oneTimeSetupCost * 1.2,
      }),
    },
    {
      id: "insurance_cost",
      label: "Extra annual insurance",
      baseValueLabel: `$${assumptions.extraInsurancePerYear}/yr`,
      lowInputLabel: `$${Math.round(assumptions.extraInsurancePerYear * 0.8)}`,
      highInputLabel: `$${Math.round(assumptions.extraInsurancePerYear * 1.2)}`,
      netAtMinus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        extraInsurancePerYear: assumptions.extraInsurancePerYear * 0.8,
      }),
      netAtPlus20: evalWithOverrides(basePrice, baseDemand, baseOwnerNights, {
        ...assumptions,
        extraInsurancePerYear: assumptions.extraInsurancePerYear * 1.2,
      }),
    },
  ];

  const items: SensitivityItem[] = candidates.map((c) => {
    const deltaMinus20 = c.netAtMinus20 - baseExpectedNet;
    const deltaPlus20 = c.netAtPlus20 - baseExpectedNet;
    const swing = Math.abs(c.netAtPlus20 - c.netAtMinus20);

    return {
      id: c.id,
      label: c.label,
      baseValueLabel: c.baseValueLabel,
      lowInputLabel: c.lowInputLabel,
      highInputLabel: c.highInputLabel,
      netOutcome: {
        low: c.netAtMinus20,
        expected: baseExpectedNet,
        high: c.netAtPlus20,
      },
      deltaFromBase: {
        low: deltaMinus20,
        expected: 0,
        high: deltaPlus20,
      },
      swing,
    };
  });

  items.sort((a, b) => b.swing - a.swing);
  return items;
}

/**
 * Compare Path A and Path B side by side, producing the verdict and sensitivity tornado rankings.
 */
export function compareHostingPaths(params: {
  compSelectionA: CompSelectionResult;
  compSelectionB: CompSelectionResult;
  home: HomeProfile;
  assumptions: CostAssumptions;
}): DualPathComparison {
  const { compSelectionA, compSelectionB, home, assumptions } = params;

  const pathA = calculatePathFinancials({
    pathId: "pathA",
    compSelection: compSelectionA,
    home,
    assumptions,
  });

  const pathB = calculatePathFinancials({
    pathId: "pathB",
    compSelection: compSelectionB,
    home,
    assumptions,
  });

  const diffExpected = pathA.netIncome.expected - pathB.netIncome.expected;
  const betterPathId: "pathA" | "pathB" | "tie" =
    Math.abs(diffExpected) < 50
      ? "tie"
      : diffExpected > 0
      ? "pathA"
      : "pathB";

  const betterPath = betterPathId === "pathB" ? pathB : pathA;
  const runnerUpPath = betterPathId === "pathB" ? pathA : pathB;

  const netAdvantage: RangeValue = {
    low: betterPath.netIncome.low - runnerUpPath.netIncome.low,
    expected: Math.abs(diffExpected),
    high: betterPath.netIncome.high - runnerUpPath.netIncome.high,
  };

  const cashAdvantage: RangeValue = {
    low: betterPath.cashNetIncome.low - runnerUpPath.cashNetIncome.low,
    expected: Math.abs(
      pathA.cashNetIncome.expected - pathB.cashNetIncome.expected
    ),
    high: betterPath.cashNetIncome.high - runnerUpPath.cashNetIncome.high,
  };

  const formatUsd = (n: number) =>
    `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

  const verdictSummary =
    betterPathId === "tie"
      ? `Both paths pay almost the same after costs (about ${formatUsd(
          pathA.netIncome.expected
        )}/yr expected net).`
      : `${betterPath.pathTitle} is projected to pay ${formatUsd(
          netAdvantage.expected
        )} more per year in expected net income (${formatUsd(
          betterPath.netIncome.expected
        )} vs. ${formatUsd(runnerUpPath.netIncome.expected)}).`;

  const sensitivityPathA = calculateSensitivityTornado(
    pathA,
    home,
    assumptions
  );
  const sensitivityPathB = calculateSensitivityTornado(
    pathB,
    home,
    assumptions
  );

  return {
    pathA,
    pathB,
    betterPathId,
    betterPathTitle: betterPath.pathTitle,
    netAdvantage,
    cashAdvantage,
    verdictSummary,
    sensitivityPathA,
    sensitivityPathB,
  };
}

/**
 * Deterministic templated plain-English summary (~120 words) using ONLY the computed numbers.
 * Used as fallback if the Gemini API call fails, and guarantees exact compliance with the prompt.
 */
export function buildDeterministicExplanation(
  comparison: DualPathComparison,
  eligibilityStatus: "eligible" | "restricted" | "ineligible"
): string {
  const { pathA, pathB, betterPathId, netAdvantage } = comparison;
  const fmt = (n: number) =>
    `${n < 0 ? "-" : ""}$${Math.abs(Math.round(n)).toLocaleString()}`;

  const eligibilityPrefix =
    eligibilityStatus === "ineligible"
      ? "Because this is not your primary residence, you are not eligible under DC rules; the figures below are informational only."
      : eligibilityStatus === "restricted"
      ? "Before applying for a DC license, you must resolve your condo, HOA, or lease restriction."
      : "Your home qualifies for both DC licensing paths.";

  const winnerTitle =
    betterPathId === "pathB"
      ? `Path B (${pathB.pathTitle})`
      : `Path A (${pathA.pathTitle})`;

  return `${eligibilityPrefix} Based on ${pathA.compCount} entire-home comps and ${pathB.compCount} private-room comps near your location, ${winnerTitle} pays about ${fmt(
    netAdvantage.expected
  )} more per year in expected net income after all costs and owner time. Under Path A, nightly rates range from ${fmt(
    pathA.nightlyRate.low
  )} to ${fmt(pathA.nightlyRate.high)} (median ${fmt(
    pathA.nightlyRate.expected
  )}); ${pathA.bindingLimitLabel.toLowerCase()} This yields ${Math.round(
    pathA.bookableNights.expected
  )} expected bookable nights, ${fmt(
    pathA.grossIncome.expected
  )} expected gross income, and ${fmt(pathA.netIncome.low)} to ${fmt(
    pathA.netIncome.high
  )} net income (expected ${fmt(
    pathA.netIncome.expected
  )}). Under Path B, nightly rates range from ${fmt(
    pathB.nightlyRate.low
  )} to ${fmt(pathB.nightlyRate.high)} (median ${fmt(
    pathB.nightlyRate.expected
  )}), with ${Math.round(
    pathB.bookableNights.expected
  )} expected bookable nights (${pathB.bindingLimitLabel.toLowerCase()}), producing ${fmt(
    pathB.grossIncome.expected
  )} expected gross and ${fmt(pathB.netIncome.low)} to ${fmt(
    pathB.netIncome.high
  )} net income (expected ${fmt(
    pathB.netIncome.expected
  )}). Estimate only, not legal or tax advice.`;
}

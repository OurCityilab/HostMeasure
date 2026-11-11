import { DC_RULES } from "../config/dcRules";
import { EligibilityEvaluation, LegalPathRuleSummary } from "../types";

/**
 * Pure function mapping homeowner primary-residence and HOA/condo/lease status
 * to DC short-term rental eligibility and the two legal hosting paths.
 */
export function evaluateEligibility(
  isPrimaryResidence: boolean,
  hasRestriction: boolean
): EligibilityEvaluation {
  const paths: LegalPathRuleSummary[] = [
    {
      id: "pathA",
      name: "Path A: Whole home while I'm away",
      licenseName: "Vacation Rental Endorsement",
      roomType: "entire",
      hostPresence: "Host is away during guest stays",
      annualNightCap: DC_RULES.vacationRental.annualNightCap,
      annualNightCapLabel: "Hard cap of 90 nights per calendar year",
      licenseFeeLabel: `$${DC_RULES.licenseFee.amountUsd} for ${DC_RULES.licenseFee.durationYears} years`,
      summary:
        "Rent your entire home while traveling or away. Requires a DC Vacation Rental license endorsement and is strictly capped at 90 cumulative nights per calendar year.",
    },
    {
      id: "pathB",
      name: "Path B: A private room while I'm home",
      licenseName: "Hosted Short-Term Rental Endorsement",
      roomType: "private",
      hostPresence: "Host stays on-site during guest stays",
      annualNightCap: DC_RULES.hostedShortTermRental.annualNightCap,
      annualNightCapLabel: "No annual night cap (up to 365 nights/year)",
      licenseFeeLabel: `$${DC_RULES.licenseFee.amountUsd} for ${DC_RULES.licenseFee.durationYears} years`,
      summary:
        "Rent a private bedroom while you remain present in the home. Requires a DC Hosted Short-Term Rental license endorsement and has no annual night cap.",
    },
  ];

  if (!isPrimaryResidence) {
    return {
      status: "ineligible",
      badgeColor: "red",
      headline: "Not eligible under current DC rules.",
      explanation:
        "Washington, DC law strictly requires a short-term rental to be the host's primary residence. Investment properties, second homes, and non-primary residences cannot obtain a Short-Term Rental or Vacation Rental license.",
      informationalOnlyBanner:
        "Market numbers below are shown as informational only — this property is not eligible for a DC short-term rental license unless it is your primary residence.",
      paths,
      disclaimer: DC_RULES.disclaimerText,
      lastVerified: DC_RULES.lastVerified,
    };
  }

  if (hasRestriction) {
    return {
      status: "restricted",
      badgeColor: "amber",
      headline: "Resolve this first.",
      explanation:
        "Even though a primary residence qualifies under District law, DC DLCP requires you to attest that your condo bylaws, HOA rules, or co-op/lease agreements do not prohibit short-term rentals. Review your governing documents or seek board permission before applying.",
      informationalOnlyBanner:
        "Your home meets DC's primary-residence rule, but private HOA, condo, or lease rules can still block you from hosting.",
      paths,
      disclaimer: DC_RULES.disclaimerText,
      lastVerified: DC_RULES.lastVerified,
    };
  }

  return {
    status: "eligible",
    badgeColor: "green",
    headline: "Eligible to apply under two legal DC paths.",
    explanation:
      "As your primary residence with no condo, HOA, or lease prohibition, you can apply for a two-year license ($99) through DC DLCP under either or both endorsements below.",
    informationalOnlyBanner: null,
    paths,
    disclaimer: DC_RULES.disclaimerText,
    lastVerified: DC_RULES.lastVerified,
  };
}

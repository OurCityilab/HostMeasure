/**
 * Washington, DC Short-Term Rental Rules Configuration
 * All rule constants live here with lastVerified: "2026-11-10".
 */

export const DC_RULES = {
  lastVerified: "2026-11-10",
  regulatoryAgencyAcronym: "DC DLCP",
  regulatoryAgencyName: "Department of Licensing and Consumer Protection (DLCP)",
  disclaimerText: "Check with DC DLCP before acting",
  primaryResidenceRequired: true,
  primaryResidenceRuleText: "Only the host's primary residence can be licensed.",
  hostedShortTermRental: {
    id: "hosted",
    name: "Hosted Short-Term Rental",
    shortLabel: "A private room while I'm home",
    hostPresentRequired: true,
    annualNightCap: null as number | null,
    annualNightCapText: "No annual night cap when the host is present during stays.",
  },
  vacationRental: {
    id: "unhosted",
    name: "Vacation Rental (Unhosted)",
    shortLabel: "Whole home while I'm away",
    hostPresentRequired: false,
    annualNightCap: 90,
    annualNightCapText: "Hard cap of 90 nights per calendar year when the host is away.",
  },
  licenseFee: {
    amountUsd: 99,
    durationYears: 2,
    annualizedUsd: 49.5,
    displayText: "$99 for two years ($49.50/year equivalent)",
  },
  lodgingTax: {
    ratePercent: 15.95,
    paidBy: "guest",
    collectedBy: "Airbnb",
    subtractFromHostIncome: false,
    displayText:
      "15.95% District lodging tax is paid by the guest and collected & remitted directly by Airbnb (not subtracted from host income).",
  },
} as const;

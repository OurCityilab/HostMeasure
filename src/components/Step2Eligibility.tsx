import React from "react";
import { AlertTriangle, CheckCircle2, Info, XCircle } from "lucide-react";
import { DC_RULES } from "../../config/dcRules";
import { EligibilityEvaluation, HomeProfile } from "../../types";

interface Step2EligibilityProps {
  home: HomeProfile;
  evaluation: EligibilityEvaluation;
  onChangeHome: (updated: Partial<HomeProfile>) => void;
}

export const Step2Eligibility: React.FC<Step2EligibilityProps> = ({
  home,
  evaluation,
  onChangeHome,
}) => {
  const statusStyles = {
    eligible: {
      container: "bg-emerald-50/70 border-emerald-200 text-emerald-950",
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-800 shrink-0 mt-0.5" />,
      statusLabel: "Eligible to Apply",
    },
    restricted: {
      container: "bg-amber-50/80 border-amber-300 text-amber-950",
      icon: <AlertTriangle className="w-5 h-5 text-amber-700 shrink-0 mt-0.5" />,
      statusLabel: "Action Required Before Applying",
    },
    ineligible: {
      container: "bg-red-50/80 border-red-200 text-red-950",
      icon: <XCircle className="w-5 h-5 text-red-700 shrink-0 mt-0.5" />,
      statusLabel: "Not Eligible for DC License",
    },
  }[evaluation.status];

  return (
    <section
      id="step-2"
      className="scroll-mt-24 bg-white border border-slate-200 rounded-xl p-6 md:p-8"
    >
      <div className="flex flex-col md:flex-row md:items-baseline justify-between gap-2 pb-6 border-b border-slate-200">
        <div>
          <span className="text-xs font-semibold text-emerald-800 tracking-wide">
            02. Step Two
          </span>
          <h2 className="text-2xl font-bold text-slate-900 mt-0.5">
            Am I Allowed to Host?
          </h2>
        </div>
        <div className="text-xs text-slate-500">
          <span>{DC_RULES.disclaimerText}</span>
          <span className="mx-1.5" aria-hidden="true">
            ·
          </span>
          <span className="font-mono tabular-nums">
            Last verified {DC_RULES.lastVerified}
          </span>
        </div>
      </div>

      {/* Two yes/no questions */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6">
        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              1. Is this your primary residence?
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              {DC_RULES.primaryResidenceRuleText} You must live at the property and qualify for the DC Homestead Deduction.
            </p>
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => onChangeHome({ isPrimaryResidence: true })}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                home.isPrimaryResidence
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Yes, primary residence
            </button>
            <button
              type="button"
              onClick={() => onChangeHome({ isPrimaryResidence: false })}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !home.isPrimaryResidence
                  ? "bg-red-700 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              No, second home / investment
            </button>
          </div>
        </div>

        <div className="p-5 rounded-xl border border-slate-200 bg-slate-50/50 flex flex-col justify-between gap-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              2. Does a condo board, HOA or lease restrict short-term rentals?
            </h3>
            <p className="text-xs text-slate-600 mt-1">
              DC DLCP requires hosts to attest that no HOA covenant, condo bylaw, or lease prohibits short-term rentals.
            </p>
          </div>
          <div className="flex items-center gap-2 p-1 bg-slate-200/80 rounded-lg w-fit">
            <button
              type="button"
              onClick={() => onChangeHome({ hasRestriction: false })}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                !home.hasRestriction
                  ? "bg-emerald-900 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              No restriction
            </button>
            <button
              type="button"
              onClick={() => onChangeHome({ hasRestriction: true })}
              className={`px-4 py-1.5 text-xs font-semibold rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                home.hasRestriction
                  ? "bg-amber-700 text-white shadow-xs"
                  : "text-slate-700 hover:text-slate-900"
              }`}
            >
              Yes, restricted or unsure
            </button>
          </div>
        </div>
      </div>

      {/* Verdict Card */}
      <div className={`mt-6 rounded-xl border p-5 ${statusStyles.container}`}>
        <div className="flex items-start gap-3">
          {statusStyles.icon}
          <div className="flex-1 space-y-2">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className="text-xs font-semibold">
                  {statusStyles.statusLabel}
                </span>
                <h3 className="text-lg font-bold mt-0.5">
                  {evaluation.headline}
                </h3>
              </div>
              <div className="text-xs opacity-80">
                <span>{evaluation.disclaimer}</span>
                <span className="mx-1.5" aria-hidden="true">
                  ·
                </span>
                <span className="font-mono tabular-nums">
                  Last verified {evaluation.lastVerified}
                </span>
              </div>
            </div>
            <p className="text-sm leading-relaxed">{evaluation.explanation}</p>
            {evaluation.informationalOnlyBanner && (
              <div className="pt-2 flex items-center gap-2 text-xs font-semibold">
                <Info className="w-4 h-4 shrink-0" />
                <span>{evaluation.informationalOnlyBanner}</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* The Two Legal Paths in DC */}
      <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-6">
        {evaluation.paths.map((path) => (
          <div
            key={path.id}
            className="rounded-xl border border-slate-200 p-5 flex flex-col justify-between space-y-4"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="font-semibold text-emerald-900">
                  {path.licenseName}
                </span>
                <span>·</span>
                <span className="font-mono tabular-nums">
                  Fee: {path.licenseFeeLabel}
                </span>
              </div>
              <h4 className="text-base font-bold text-slate-900">{path.name}</h4>
              <p className="text-sm text-slate-600 leading-relaxed">
                {path.summary}
              </p>
            </div>

            <div className="pt-3 border-t border-slate-100 space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Annual night cap:</span>
                <span className="font-semibold font-mono tabular-nums text-slate-900">
                  {path.annualNightCapLabel}
                </span>
              </div>
              <div className="flex justify-between">
                <span>DC lodging tax (15.95%):</span>
                <span className="text-slate-700">
                  Paid by guest &amp; remitted by Airbnb
                </span>
              </div>
              <div className="pt-1 text-[11px] text-slate-500 flex items-center justify-between">
                <span>{DC_RULES.disclaimerText}</span>
                <span className="font-mono tabular-nums">
                  Verified {DC_RULES.lastVerified}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
};

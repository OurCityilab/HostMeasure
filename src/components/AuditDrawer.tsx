import React from "react";
import { X } from "lucide-react";
import { DATA_SNAPSHOT_METADATA } from "../../config/dataSource";
import { DC_RULES } from "../../config/dcRules";
import {
  AdjustmentLogEntry,
  CompSelectionResult,
  CostAssumptions,
  DualPathComparison,
  HomeProfile,
} from "../../types";

interface AuditDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  home: HomeProfile;
  assumptions: CostAssumptions;
  compSelectionA: CompSelectionResult;
  compSelectionB: CompSelectionResult;
  comparison: DualPathComparison;
  adjustmentsLog: AdjustmentLogEntry[];
  totalDatasetRows: number;
  isFallbackSample: boolean;
}

export const AuditDrawer: React.FC<AuditDrawerProps> = ({
  isOpen,
  onClose,
  home,
  assumptions,
  compSelectionA,
  compSelectionB,
  comparison,
  adjustmentsLog,
  totalDatasetRows,
  isFallbackSample,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40 backdrop-blur-xs">
      <div className="relative w-full max-w-2xl bg-white h-full overflow-y-auto shadow-2xl border-l border-slate-200 p-6 md:p-8 space-y-8">
        {/* Drawer Header */}
        <div className="flex items-start justify-between gap-4 pb-4 border-b border-slate-200">
          <div>
            <span className="text-xs font-semibold text-emerald-800">
              Methodology &amp; Full Audit Trail
            </span>
            <h2 className="text-xl font-bold text-slate-900 mt-0.5">
              How We Got This Result
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
            aria-label="Close drawer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 1. Data Snapshot & Source */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">
            1. Market Data Snapshot
          </h3>
          <div className="rounded-xl border border-slate-200 p-4 text-xs space-y-1.5 bg-slate-50/60">
            <div className="flex justify-between">
              <span className="text-slate-600">Source:</span>
              <span className="font-semibold text-slate-900">
                {DATA_SNAPSHOT_METADATA.footerCitation}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Snapshot Date:</span>
              <span className="font-mono tabular-nums text-slate-900">
                {DATA_SNAPSHOT_METADATA.snapshotDate}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Active Loaded Rows:</span>
              <span className="font-mono tabular-nums text-slate-900">
                {totalDatasetRows.toLocaleString()} listings{" "}
                {isFallbackSample ? "(5-row fallback sample active)" : "(full dataset)"}
              </span>
            </div>
            <p className="text-slate-500 pt-1">
              Cleaned to entire homes and private rooms in Washington, DC with a minimum stay under 30 nights, a usable nightly price, and at least one review in the last 12 months. Booked nights (`est_nights_ltm`) are Inside Airbnb estimates capped at 255 nights/year.
            </p>
          </div>
        </div>

        {/* 2. DC Regulatory Rule Values */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              2. Washington, DC Short-Term Rental Rules
            </h3>
            <span className="text-xs font-mono tabular-nums text-slate-500">
              lastVerified: {DC_RULES.lastVerified}
            </span>
          </div>
          <div className="rounded-xl border border-slate-200 p-4 text-xs space-y-2 bg-slate-50/60">
            <div className="flex justify-between">
              <span className="text-slate-600">Primary Residence Requirement:</span>
              <span className="font-semibold text-slate-900">
                {DC_RULES.primaryResidenceRuleText}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Path A (Vacation Rental):</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                90-night annual hard cap (unhosted)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Path B (Hosted STR):</span>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                No annual night cap (host present)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">Two-Year License Fee:</span>
              <span className="font-mono tabular-nums text-slate-900">
                ${DC_RULES.licenseFee.amountUsd} / 2 years (${DC_RULES.licenseFee.annualizedUsd.toFixed(2)}/yr)
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-slate-600">District Lodging Tax:</span>
              <span className="font-mono tabular-nums text-slate-900">
                {DC_RULES.lodgingTax.ratePercent}% (paid by guest, collected by Airbnb)
              </span>
            </div>
            <div className="pt-1 text-slate-500">
              {DC_RULES.disclaimerText} · Verified {DC_RULES.lastVerified}
            </div>
          </div>
        </div>

        {/* 3. Homeowner Inputs & Cost Assumptions */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">
            3. Your Home Inputs &amp; Cost Assumptions
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
              <div className="font-semibold text-slate-900 mb-1">Home Profile</div>
              <div className="flex justify-between">
                <span className="text-slate-600">Neighbourhood:</span>
                <span className="font-medium text-slate-900 text-right">
                  {home.neighbourhood}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Size:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {home.bedrooms} BR · {home.bathrooms} BA · {home.guests} guests
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Owner Available Nights:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {home.nightsAvailable} nights/yr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Reference Coordinate:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {compSelectionA.homePoint.lat.toFixed(4)},{" "}
                  {compSelectionA.homePoint.lon.toFixed(4)}
                </span>
              </div>
            </div>

            <div className="rounded-xl border border-slate-200 p-3.5 space-y-1.5">
              <div className="font-semibold text-slate-900 mb-1">
                Cost Assumptions (&ldquo;your assumption&rdquo;)
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Airbnb Host Fee:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {assumptions.hostFeePercent}%
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Average Stay Length:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {assumptions.averageStayNights} nights
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Cleaning (Whole Home / Room):</span>
                <span className="font-mono tabular-nums text-slate-900">
                  ${assumptions.cleaningPerStay} (Path A) / ${assumptions.cleaningPerStayRoom} (Path B)
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Supplies per Stay:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  ${assumptions.suppliesPerStay} / stay
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Extra Insurance &amp; Utilities:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  ${assumptions.extraInsurancePerYear}/yr + ${assumptions.extraUtilitiesPerNight}/nt
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Owner Time Value:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  {assumptions.ownerHoursPerStay} hrs/stay @ ${assumptions.ownerHourlyRate}/hr
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">One-Time Setup:</span>
                <span className="font-mono tabular-nums text-slate-900">
                  ${assumptions.oneTimeSetupCost.toLocaleString()} / {assumptions.setupAmortizationYears} yrs
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Selected Comps with Scores for Both Paths */}
        <div className="space-y-4">
          <h3 className="text-sm font-bold text-slate-900">
            4. Scoring Formula &amp; Selected Homes
          </h3>
          <p className="text-xs text-slate-600 font-mono bg-slate-100 p-2.5 rounded-lg">
            score = max(0, 100 - 25×|bedrooms diff| - 8×|guests diff| - 10×|bathrooms diff| - 12×miles)
          </p>

          {[
            {
              title: `Path A Comps (${compSelectionA.comps.length} entire homes · Median $${Math.round(
                comparison.pathA.nightlyRate.expected
              )}/nt)`,
              comps: compSelectionA.comps,
            },
            {
              title: `Path B Comps (${compSelectionB.comps.length} private rooms · Median $${Math.round(
                comparison.pathB.nightlyRate.expected
              )}/nt)`,
              comps: compSelectionB.comps,
            },
          ].map((group) => (
            <div key={group.title} className="space-y-2">
              <h4 className="text-xs font-semibold text-slate-800">
                {group.title}
              </h4>
              <div className="max-h-52 overflow-y-auto border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
                {group.comps.map((c, idx) => (
                  <div
                    key={c.id}
                    className="py-2 px-3 flex items-center justify-between gap-2"
                  >
                    <div className="truncate">
                      <span className="font-mono text-slate-400 mr-1.5">
                        #{idx + 1}
                      </span>
                      <a
                        href={`https://www.airbnb.com/rooms/${c.id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-slate-900 hover:underline"
                      >
                        {c.name}
                      </a>
                      <span className="text-slate-400 font-mono text-[11px] ml-1.5">
                        (ID: {c.id})
                      </span>
                    </div>
                    <div className="font-mono tabular-nums text-slate-700 shrink-0">
                      Score {c.score.toFixed(1)} · ${Math.round(c.price)}/nt ·{" "}
                      {Math.round(c.est_nights_ltm)} est. nts
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* 5. Adjustments Log */}
        <div className="space-y-2">
          <h3 className="text-sm font-bold text-slate-900">
            5. Adjustments Log ({adjustmentsLog.length} entries)
          </h3>
          {adjustmentsLog.length === 0 ? (
            <p className="text-xs text-slate-500">
              No manual comp exclusions have been made in this session.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-lg divide-y divide-slate-100 text-xs">
              {adjustmentsLog.map((entry, idx) => (
                <div
                  key={`${entry.timestamp}-${entry.listingId}-${idx}`}
                  className="p-2.5 flex items-center justify-between gap-2"
                >
                  <div>
                    <span className="font-mono text-slate-400 mr-2">
                      {entry.timestamp}
                    </span>
                    <span className="font-medium text-slate-900">
                      ID {entry.listingId}
                    </span>{" "}
                    — {entry.reason}
                  </div>
                  <div className="font-mono tabular-nums font-semibold text-emerald-900 shrink-0">
                    Median delta:{" "}
                    {entry.effect.expected >= 0 ? "+" : "-"}$
                    {Math.abs(Math.round(entry.effect.expected))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

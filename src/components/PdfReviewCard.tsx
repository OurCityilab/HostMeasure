import React from "react";
import {
  AlertCircle,
  Building,
  CheckCircle2,
  DollarSign,
  MapPin,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { ParsedPdfListing, PropertyPhoto } from "../../types";

interface PdfReviewCardProps {
  card: ParsedPdfListing;
  mode: "step1" | "step3";
  onApply: (card: ParsedPdfListing) => void;
  onDismiss: () => void;
  onRemovePhoto: (photoId: string) => void;
}

export const PdfReviewCard: React.FC<PdfReviewCardProps> = ({
  card,
  mode,
  onApply,
  onDismiss,
  onRemovePhoto,
}) => {
  const isStep1 = mode === "step1";
  const matched = card.matchedListing;

  return (
    <div className="rounded-xl border border-slate-300 bg-white p-5 shadow-sm space-y-4">
      {/* Header with Title and Match Badge */}
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            {card.isInDataset ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
                <CheckCircle2 className="w-3.5 h-3.5" />
                In DC dataset
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                Not in dataset
              </span>
            )}
            {card.fileNames.length > 1 && (
              <span className="text-[11px] text-slate-500 font-mono">
                Merged {card.fileNames.length} PDF pages
              </span>
            )}
          </div>
          <h4 className="text-base font-bold text-slate-900 leading-snug">
            {card.title}
          </h4>
          {card.listingId && (
            <p className="text-xs text-slate-500 font-mono">
              Listing ID: {card.listingId}
            </p>
          )}
        </div>

        <button
          type="button"
          onClick={onDismiss}
          className="self-start p-1 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 cursor-pointer"
          title="Dismiss this import"
          aria-label="Dismiss import card"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Warning if city may not be DC */}
      {card.cityWarning && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-center gap-2 text-xs text-amber-900">
          <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
          <span>{card.cityWarning}</span>
        </div>
      )}

      {/* Extracted / Matched Property Facts */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 py-2 border-y border-slate-100 text-xs">
        <div>
          <span className="text-slate-500 block">Room type</span>
          <span className="font-semibold text-slate-800 capitalize">
            {card.roomType === "entire" ? "Entire home/apt" : "Private room"}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Bedrooms / Baths</span>
          <span className="font-semibold text-slate-800 font-mono tabular-nums">
            {card.bedrooms === 0 ? "Studio" : `${card.bedrooms} BR`} · {card.bathrooms} Bath
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Guests</span>
          <span className="font-semibold text-slate-800 font-mono tabular-nums">
            Sleeps {card.guests}
          </span>
        </div>
        <div>
          <span className="text-slate-500 block">Neighbourhood</span>
          <span className="font-semibold text-slate-800 truncate block">
            {matched ? matched.neighbourhood : "Not in dataset"}
          </span>
        </div>
      </div>

      {/* Pricing Comparison */}
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600">
        {card.quotedPrice !== null && (
          <span>
            Quoted{" "}
            <strong className="font-mono tabular-nums text-slate-900">
              ${card.quotedPrice}/night
            </strong>{" "}
            on page
          </span>
        )}
        {matched && (
          <span>
            Dataset active price:{" "}
            <strong className="font-mono tabular-nums text-emerald-900">
              ${Math.round(matched.price)}/night
            </strong>
          </span>
        )}
      </div>

      {/* Photos Thumbnail Strip with [x] Remove Buttons */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-800">
            Imported Photos ({card.photos.length} of 12 max)
          </span>
          {card.photos.length > 0 && (
            <span className="text-slate-500">
              Tagged as &ldquo;Untagged&rdquo; · remove unwanted photos below
            </span>
          )}
        </div>

        {card.photos.length === 0 ? (
          <p className="text-xs text-slate-400 italic py-2">
            No large residential photos found in the PDF.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2.5">
            {card.photos.map((p) => (
              <div
                key={p.photoId}
                className="relative w-20 h-16 rounded-md overflow-hidden bg-slate-100 border border-slate-200 group"
              >
                <img
                  src={p.dataUrl}
                  alt=""
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => onRemovePhoto(p.photoId)}
                  className="absolute top-1 right-1 p-1 bg-red-600/90 text-white rounded hover:bg-red-700 opacity-90 group-hover:opacity-100 transition-opacity cursor-pointer shadow-sm"
                  title="Remove this photo"
                  aria-label="Remove photo"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Action Section */}
      <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-slate-100">
        {isStep1 ? (
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => onApply(card)}
              className="w-full sm:w-auto px-4 py-2 rounded-lg bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-900 transition-colors shadow-sm cursor-pointer"
            >
              Use as my home
            </button>
            <span className="text-xs text-slate-500 hidden sm:inline">
              {card.isInDataset
                ? "Fills details, sets map pin, and excludes your home from comps."
                : "Fills details parsed from text; please select your DC neighbourhood."}
            </span>
          </div>
        ) : (
          <div className="w-full">
            {card.isInDataset ? (
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onApply(card)}
                  className="px-4 py-2 rounded-lg bg-emerald-800 text-white text-sm font-semibold hover:bg-emerald-900 transition-colors shadow-sm cursor-pointer"
                >
                  Add as a comparison
                </button>
                <span className="text-xs text-slate-500">
                  Pins this home in your comparisons with an &ldquo;Added by you&rdquo; tag and imported photos.
                </span>
              </div>
            ) : (
              <div className="rounded-lg bg-slate-100 border border-slate-200 p-3 text-xs text-slate-600">
                This listing is not in the DC dataset, so it cannot be used as a comparison.
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

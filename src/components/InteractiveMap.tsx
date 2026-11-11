import React, { useEffect } from "react";
import {
  CircleMarker,
  MapContainer,
  Popup,
  TileLayer,
  useMap,
  useMapEvents,
} from "react-leaflet";
import { Coordinates, ScoredComp } from "../../types";

interface MapViewportUpdaterProps {
  center: Coordinates;
  zoom?: number;
}

function MapViewportUpdater({ center, zoom }: MapViewportUpdaterProps) {
  const map = useMap();
  useEffect(() => {
    map.setView([center.lat, center.lon], zoom ?? map.getZoom(), {
      animate: true,
    });
  }, [center.lat, center.lon, zoom, map]);
  return null;
}

interface MapClickHandlerProps {
  onSelectLocation?: (coords: Coordinates) => void;
}

function MapClickHandler({ onSelectLocation }: MapClickHandlerProps) {
  useMapEvents({
    click(e) {
      if (onSelectLocation) {
        onSelectLocation({
          lat: Number(e.latlng.lat.toFixed(5)),
          lon: Number(e.latlng.lng.toFixed(5)),
        });
      }
    },
  });
  return null;
}

export interface InteractiveMapProps {
  homePoint: Coordinates;
  isCustomPin: boolean;
  onSelectHomePoint?: (coords: Coordinates) => void;
  comps?: ScoredComp[];
  onExcludeCompClick?: (comp: ScoredComp) => void;
  heightClass?: string;
  interactivePinDrop?: boolean;
}

export const InteractiveMap: React.FC<InteractiveMapProps> = ({
  homePoint,
  isCustomPin,
  onSelectHomePoint,
  comps = [],
  onExcludeCompClick,
  heightClass = "h-80",
  interactivePinDrop = false,
}) => {
  return (
    <div
      className={`relative w-full ${heightClass} rounded-xl overflow-hidden border border-slate-200 bg-slate-50`}
    >
      <MapContainer
        center={[homePoint.lat, homePoint.lon]}
        zoom={14}
        scrollWheelZoom={false}
        className="w-full h-full"
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />
        <MapViewportUpdater center={homePoint} />
        {interactivePinDrop && onSelectHomePoint && (
          <MapClickHandler onSelectLocation={onSelectHomePoint} />
        )}

        {/* Comparable listings markers */}
        {comps.map((comp, idx) => (
          <CircleMarker
            key={comp.id}
            center={[comp.lat, comp.lon]}
            radius={8}
            pathOptions={{
              color: "#0f172a",
              weight: 1.5,
              fillColor: "#10b981",
              fillOpacity: 0.85,
            }}
          >
            <Popup>
              <div className="text-xs space-y-1.5 min-w-[200px] font-sans">
                <div className="flex items-center justify-between gap-2 text-slate-500">
                  <span>Rank #{idx + 1}</span>
                  <span>·</span>
                  <span className="font-mono font-semibold text-slate-900">
                    Score {Math.round(comp.score)}
                  </span>
                </div>
                <a
                  href={`https://www.airbnb.com/rooms/${comp.id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-emerald-800 hover:underline block leading-snug"
                >
                  {comp.name} ↗
                </a>
                <div className="font-mono text-slate-800">
                  ${Math.round(comp.price)}/night · {Math.round(comp.est_nights_ltm)}{" "}
                  est. nights/yr
                </div>
                <div className="text-slate-600">{comp.whyChosen}</div>
                {onExcludeCompClick && (
                  <button
                    type="button"
                    onClick={() => onExcludeCompClick(comp)}
                    className="mt-1 w-full px-2.5 py-1 text-xs font-medium text-red-700 bg-red-50 hover:bg-red-100 rounded border border-red-200 transition-colors"
                  >
                    Exclude this listing
                  </button>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}

        {/* Homeowner location marker */}
        <CircleMarker
          center={[homePoint.lat, homePoint.lon]}
          radius={11}
          pathOptions={{
            color: "#ffffff",
            weight: 3,
            fillColor: "#064e3b",
            fillOpacity: 1,
          }}
        >
          <Popup>
            <div className="text-xs space-y-1 font-sans">
              <div className="font-semibold text-slate-900">
                Your Home Reference Point
              </div>
              <div className="text-slate-600">
                {isCustomPin
                  ? "Custom dropped pin location"
                  : "Neighbourhood listing centroid"}
              </div>
              <div className="font-mono text-slate-500">
                {homePoint.lat.toFixed(4)}, {homePoint.lon.toFixed(4)}
              </div>
            </div>
          </Popup>
        </CircleMarker>
      </MapContainer>
    </div>
  );
};

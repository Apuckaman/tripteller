import { useEffect, useState } from "react";
import { MapContainer, TileLayer, Circle, Marker, Popup } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { fetchPois, type Poi } from "../lib/pois";
import { useGeofencing } from "../hooks/useGeofencing";

export default function MapView() {
  const [pois, setPois] = useState<Poi[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [autoplayBlocked, setAutoplayBlocked] = useState<string | null>(null);

  // POI-k betöltése Strapi-ból
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPois();
        setPois(data);
      } catch (e: any) {
        setError(e?.message || "Hiba a POI-k lekérésekor");
      }
    })();
  }, []);

  // Geofencing (user pozíció + enter/exit események)
  const { position: userPos, insidePoi, onEvent } = useGeofencing(pois ?? [], {
    radiusDefault: 150,
    highAccuracy: true,
    cooldownMs: 15000,
    accuracyMax: 2000,
  });

  // Belépéskor lejátszás (audio → fallback TTS)
  useEffect(() => {
    const off = onEvent(async (e) => {
      if (e.type !== "enter") return;

      // 1) Ha van audio URL → próbáljuk lejátszani
      if (e.poi.audioUrl) {
        try {
          const a = new Audio(e.poi.audioUrl);
          await a.play();
          setAutoplayBlocked(null);
          return;
        } catch (err) {
          console.warn("Audio autoplay blocked or failed, fallback to TTS.", err);
          // folytatjuk TTS-sel
        }
      }

      // 2) Fallback: TTS (ha van ttsText)
      if (e.poi.ttsText) {
        try {
          const utter = new SpeechSynthesisUtterance(e.poi.ttsText);
          utter.lang = "hu-HU";
          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utter);
          setAutoplayBlocked(null);
        } catch (err) {
          console.warn("TTS failed:", err);
          setAutoplayBlocked(`Nem sikerült automatikusan lejátszani: ${e.poi.name}`);
        }
      }
    });

    return off;
  }, [onEvent]);

  if (error) return <div style={{ padding: 8 }}>Hiba: {error}</div>;
  if (!pois) return <div style={{ padding: 8 }}>POI-k betöltése…</div>;

  const center = userPos || { lat: pois[0].lat, lng: pois[0].lng };

  // Alap Leaflet ikon (különben nem látszik a marker)
  const DefaultIcon = L.icon({
    iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
  });
  // @ts-ignore
  L.Marker.prototype.options.icon = DefaultIcon;

  return (
    <div style={{ height: "100vh", width: "100%", position: "relative" }}>
      {/* Autoplay-blokkolás jelzés + kézi indítás */}
      {autoplayBlocked && (
        <div style={{
          position: "absolute", top: 12, left: "50%", transform: "translateX(-50%)",
          background: "rgba(0,0,0,0.7)", color: "#fff", padding: "8px 12px",
          borderRadius: 12, zIndex: 9999
        }}>
          {autoplayBlocked} — <button
            onClick={async () => {
              setAutoplayBlocked(null);
              if (insidePoi?.audioUrl) {
                try {
                  const a = new Audio(insidePoi.audioUrl);
                  await a.play();
                } catch {}
              } else if (insidePoi?.ttsText) {
                const utter = new SpeechSynthesisUtterance(insidePoi.ttsText);
                utter.lang = "hu-HU";
                window.speechSynthesis.cancel();
                window.speechSynthesis.speak(utter);
              }
            }}
            style={{ background: "#fff", color: "#000", border: "none", padding: "4px 8px", borderRadius: 8, cursor: "pointer" }}
          >
            Lejátszás
          </button>
        </div>
      )}

      <MapContainer center={[center.lat, center.lng]} zoom={15} style={{ height: "100%", width: "100%" }}>
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Felhasználói pozíció (becsült) */}
        {userPos && (
          <Circle
            center={[userPos.lat, userPos.lng]}
            radius={50}
            pathOptions={{ color: "blue", fillColor: "blue", fillOpacity: 0.2 }}
          />
        )}

        {/* POI-k + 150 m-es körök */}
        {pois.map((p) => (
          <Marker key={p.id} position={[p.lat, p.lng]}>
            <Popup>
              <b>{p.name}</b>
              {p.ttsText && (
                <>
                  <br />
                  <small>{p.ttsText}</small>
                </>
              )}
            </Popup>
            <Circle
              center={[p.lat, p.lng]}
              radius={p.radius ?? 150}
              pathOptions={{ color: "red", fillColor: "red", fillOpacity: 0.08 }}
            />
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}

import { useEffect, useState, useRef } from "react";
import {
  MapContainer,
  TileLayer,
  Circle,
  Marker,
  Popup,
  CircleMarker,
} from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { fetchPois, type Poi } from "../lib/pois";
import { useGeofencing } from "../hooks/useGeofencing";

export default function MapView() {
  const [pois, setPois] = useState<Poi[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [audioEnabled, setAudioEnabled] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsUtteranceRef = useRef<SpeechSynthesisUtterance | null>(null);

  // POI-k betöltése Strapi-ból
  useEffect(() => {
    (async () => {
      try {
        const data = await fetchPois();
        setPois(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "POI fetch failed");
      }
    })();
  }, []);

  // Geofencing – csak pozíció + enter/exit események
  const { position: userPos, insidePoi, onEvent } = useGeofencing(pois ?? [], {
    cooldownMs: 5000,
    accuracyMax: 2000,
  });

  // Minden hang leállítása
  const stopAll = () => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    if (ttsUtteranceRef.current) {
      window.speechSynthesis.cancel();
      ttsUtteranceRef.current = null;
    }
    setIsPlaying(false);
  };

  // Mp3 lejátszás
  const playAudio = (url: string) => {
    if (!audioEnabled) return;

    stopAll();

    const audio = new Audio(url);
    audioRef.current = audio;

    audio
      .play()
      .then(() => {
        console.log("AUDIO STARTED:", url);
        setIsPlaying(true);
      })
      .catch((err) => {
        console.warn("Audio play failed:", err);
      });

    audio.onended = () => {
      setIsPlaying(false);
      audioRef.current = null;
    };
  };

  // TTS lejátszás (ha nincs mp3, de van szöveg)
  const playTts = (text: string) => {
    if (!audioEnabled) return;

    stopAll();

    if (!("speechSynthesis" in window)) {
      console.warn("TTS not supported in this browser.");
      return;
    }

    const utter = new SpeechSynthesisUtterance(text);
    ttsUtteranceRef.current = utter;

    utter.onstart = () => setIsPlaying(true);
    utter.onend = () => {
      setIsPlaying(false);
      ttsUtteranceRef.current = null;
    };

    window.speechSynthesis.speak(utter);
  };

  // POI-hoz tartozó lejátszás (mp3 vagy TTS)
  const playForPoi = (poi: Poi) => {
    if (poi.audioUrl) {
      playAudio(poi.audioUrl);
    } else if (poi.ttsText) {
      playTts(poi.ttsText);
    } else {
      console.log("POI without audio / tts:", poi.name);
    }
  };

  // Geofence enter → automatikus lejátszás
  useEffect(() => {
    const unsub = onEvent((e) => {
      if (e.type === "enter" && audioEnabled) {
        console.log("ENTER POI (auto play):", e.poi.name);
        playForPoi(e.poi);
      }
      if (e.type === "exit") {
        console.log("EXIT POI:", e.poi.name);
        // kilépéskor nem kötelező megállítani a hangot
      }
    });

    return unsub;
  }, [onEvent, audioEnabled, pois]);

  // User marker ikon
  const userIcon = new L.DivIcon({
    html: `<div style="background: #3B82F6; width: 16px; height: 16px; border-radius: 50%; border: 3px solid white; box-shadow: 0 2px 6px rgba(0,0,0,0.3);"></div>`,
    iconSize: [22, 22],
    className: "user-location-marker",
  });

  if (error) {
    return (
      <div style={{ padding: "1rem", color: "#b91c1c" }}>Error: {error}</div>
    );
  }

  if (!pois) {
    return (
      <div style={{ padding: "1rem", color: "#4b5563" }}>Loading POIs...</div>
    );
  }

  return (
    <div
      style={{
        position: "relative",
        width: "100%",
        height: "100vh",
        overflow: "hidden",
      }}
    >
      {/* Hang engedélyező panel */}
      {!audioEnabled && (
        <div
          style={{
            position: "absolute",
            top: "1rem",
            left: "1rem",
            zIndex: 1000,
            background: "white",
            padding: "1rem",
            borderRadius: "0.5rem",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
          }}
        >
          <p style={{ marginBottom: "0.5rem" }}>
            A hanglejátszáshoz kattints az alábbi gombra:
          </p>
          <button
            onClick={() => setAudioEnabled(true)}
            style={{
              padding: "0.4rem 0.8rem",
              borderRadius: "0.375rem",
              border: "1px solid #2563eb",
              background: "#2563eb",
              color: "white",
              cursor: "pointer",
            }}
          >
            🔈 Hangok engedélyezése
          </button>
        </div>
      )}

      {/* TÉRKÉP */}
      <MapContainer
        center={[47.4979, 19.0402]}
        zoom={13}
        style={{ height: "100%", width: "100%" }}
      >
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* USER POZÍCIÓ */}
        {userPos && (
          <Marker position={[userPos.lat, userPos.lng]} icon={userIcon}>
            <Popup>You are here</Popup>
          </Marker>
        )}

        {/* Először nagy körök – nem interaktívak, hogy ne fogják meg a kattintást */}
        {pois.map((poi) => (
          <Circle
            key={`circle-${poi.id}`}
            center={[poi.lat, poi.lng]}
            radius={poi.radius}
            pathOptions={{
              color: insidePoi?.id === poi.id ? "#EF4444" : "#3B82F6",
              fillColor: insidePoi?.id === poi.id ? "#EF4444" : "#3B82F6",
              fillOpacity: 0.1,
              weight: 1,
            }}
            interactive={false}
          />
        ))}

        {/* POI pont + popup gombok */}
        {pois.map((poi) => (
          <CircleMarker
            key={poi.id}
            center={[poi.lat, poi.lng]}
            radius={6}
            pathOptions={{
              color: insidePoi?.id === poi.id ? "#EF4444" : "#10B981",
              fillColor: insidePoi?.id === poi.id ? "#EF4444" : "#10B981",
              fillOpacity: 0.6,
              weight: 2,
            }}
          >
            <Popup>
              <div style={{ fontSize: "0.875rem", minWidth: "160px" }}>
                <h3 style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
                  {poi.name}
                </h3>
                <p style={{ margin: 0, marginBottom: "0.25rem" }}>
                  Radius: {poi.radius} m
                </p>

                {poi.ttsText && !poi.audioUrl && (
                  <p
                    style={{
                      margin: 0,
                      marginBottom: "0.25rem",
                      color: "#4b5563",
                    }}
                  >
                    {poi.ttsText}
                  </p>
                )}

                {(poi.audioUrl || poi.ttsText) && (
                  <div style={{ marginTop: "0.5rem", display: "flex", gap: 8 }}>
                    <button
                      onClick={() => playForPoi(poi)}
                      style={{
                        flex: 1,
                        padding: "0.3rem 0.6rem",
                        borderRadius: "0.375rem",
                        border: "1px solid #16a34a",
                        background: "#16a34a",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      {isPlaying ? "⏸ Újralejátszás" : "▶ Lejátszás"}
                    </button>
                    <button
                      onClick={stopAll}
                      style={{
                        flex: 1,
                        padding: "0.3rem 0.6rem",
                        borderRadius: "0.375rem",
                        border: "1px solid #dc2626",
                        background: "#dc2626",
                        color: "white",
                        cursor: "pointer",
                      }}
                    >
                      ⏹ Megállítás
                    </button>
                  </div>
                )}
              </div>
            </Popup>
          </CircleMarker>
        ))}
      </MapContainer>

      {/* Aktuális POI alsó infó */}
      {insidePoi && (
        <div
          style={{
            position: "absolute",
            left: "1rem",
            right: "1rem",
            bottom: "1rem",
            background: "white",
            padding: "0.75rem",
            borderRadius: "0.5rem",
            boxShadow: "0 2px 6px rgba(0,0,0,0.2)",
            zIndex: 999,
          }}
        >
          <h3 style={{ fontWeight: 700, marginBottom: "0.25rem" }}>
            📍 {insidePoi.name}
          </h3>
          {insidePoi.ttsText && (
            <p
              style={{
                fontSize: "0.875rem",
                color: "#4b5563",
                margin: 0,
              }}
            >
              {insidePoi.ttsText}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

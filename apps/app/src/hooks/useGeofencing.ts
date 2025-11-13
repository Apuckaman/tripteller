import { useEffect, useRef, useState } from "react";
import { haversineMeters } from "../lib/geo";
import type { Poi } from "../lib/pois";

type GeofenceEvent = { type: "enter" | "exit"; poi: Poi; distance: number };

type Options = {
  radiusDefault?: number;   // m
  highAccuracy?: boolean;   // GPS bekapcsolása mobilon
  cooldownMs?: number;      // minimális idő két trigger között
  accuracyMax?: number;     // ha pontosság > accuracyMax, ne frissítsen
};

export function useGeofencing(
  pois: Poi[] = [],
  opts: Options = {}
) {
  const {
    radiusDefault = 150,
    highAccuracy = true,
    cooldownMs = 15000,
    accuracyMax = 2000,
  } = opts;

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(null);
  const [insidePoi, setInsidePoi] = useState<Poi | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const listenersRef = useRef<Array<(e: GeofenceEvent) => void>>([]);
  const cooldownUntilRef = useRef<number>(0);

  // Geolokáció figyelése
  useEffect(() => {
    if (!navigator.geolocation) return;
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        if (accuracy && accuracyMax && accuracy > accuracyMax) return;
        setPosition({ lat, lng });
      },
      (err) => {
        console.warn("Geolocation error:", err);
      },
      { enableHighAccuracy: highAccuracy, maximumAge: 3000, timeout: 10000 }
    );
    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [highAccuracy, accuracyMax]);

  // Belépés / kilépés detektálás
  useEffect(() => {
    if (!position) return;

    const now = Date.now();
    let nearest: { poi: Poi; dist: number } | null = null;

    for (const p of pois) {
      const r = p.radius ?? radiusDefault;
      const d = haversineMeters(position.lat, position.lng, p.lat, p.lng);
      if (d <= r && (!nearest || d < nearest.dist)) {
        nearest = { poi: p, dist: d };
      }
    }

    const currentlyInside = !!nearest;
    const wasInside = !!insidePoi;

    if (currently=false && wasInside) {
      const prev = insidePoi!;
      setInsidePoi(null);
      listenersRef.current.forEach((fn) => fn({ type: "exit", poi: prev, distance: Infinity }));
      return;
    }

    if (nearest) {
      if (!wasInside && now >= cooldownUntilRef.current) {
        setInsidePoi(nearest.poi);
        cooldownUntilRef.current = now + cooldownMs;
        listenersRef.current.forEach((fn) =>
          fn({ type: "enter", poi: nearest!.poi, distance: nearest!.dist })
        );
      } else {
        setInsidePoi(nearest.poi); // bent maradunk
      }
    }
  }, [position, pois, insidePoi, radiusDefault, cooldownMs]);

  // Eseményfeliratkozás
  const onEvent = (handler: (e: GeofenceEvent) => void) => {
    listenersRef.current.push(handler);
    return () => {
      listenersRef.current = listenersRef.current.filter((h) => h !== handler);
    };
  };

  return { position, insidePoi, onEvent };
}

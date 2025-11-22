import { useEffect, useRef, useState } from "react";
import { haversineMeters } from "../lib/geo";
import type { Poi } from "../lib/pois";

type GeofenceEvent = { type: "enter" | "exit"; poi: Poi; distance: number };

type Options = {
  radiusDefault?: number;
  highAccuracy?: boolean;
  cooldownMs?: number;
  accuracyMax?: number;
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

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [insidePoi, setInsidePoi] = useState<Poi | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const listenersRef = useRef<Array<(e: GeofenceEvent) => void>>([]);
  const cooldownUntilRef = useRef<number>(0);

  // GPS követés
  useEffect(() => {
    if (!navigator.geolocation) {
      console.warn("❌ Geolocation nem érhető el a böngészőben.");
      return;
    }

    console.log("📍 STARTING GPS TRACKING (highAccuracy:", highAccuracy, ")");
    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng, accuracy } = pos.coords;
        console.log("📍 GPS POSITION:", lat, lng, "Accuracy:", accuracy);

        if (accuracy && accuracyMax && accuracy > accuracyMax) {
          console.log(
            "⚠ Pozíció túl pontatlan, kihagyjuk. accuracy:",
            accuracy,
            "limit:",
            accuracyMax
          );
          return;
        }

        setPosition({ lat, lng });
      },
      (err) => console.warn("❌ GEOLOCATION ERROR:", err),
      {
        enableHighAccuracy: highAccuracy,
        maximumAge: 3000,
        timeout: 10000,
      }
    );

    return () => {
      if (watchIdRef.current !== null) {
        navigator.geolocation.clearWatch(watchIdRef.current);
      }
    };
  }, [highAccuracy, accuracyMax]);

  // Geofence logika
  useEffect(() => {
    if (!position) return;

    const now = Date.now();
    let nearest: { poi: Poi; dist: number } | null = null;

    console.log("📍 CHECKING POIS - User position:", position);

    for (const p of pois) {
      const r = p.radius ?? radiusDefault;
      const d = haversineMeters(position.lat, position.lng, p.lat, p.lng);
      console.log(`   📍 ${p.name}: ${d}m / ${r}m radius`);

      if (d <= r && (!nearest || d < nearest.dist)) {
        nearest = { poi: p, dist: d };
      }
    }

    const wasInside = !!insidePoi;
    const currentlyInside = !!nearest;

    // KILÉPÉS
    if (!currentlyInside && wasInside) {
      const prev = insidePoi!;
      console.log("🚪 EXIT POI:", prev.name);
      setInsidePoi(null);
      listenersRef.current.forEach((fn) =>
        fn({ type: "exit", poi: prev, distance: Infinity })
      );
      return;
    }

    // BELÉPÉS
    if (nearest) {
      if (!wasInside && now >= cooldownUntilRef.current) {
        console.log("🚪 ENTER POI:", nearest.poi.name, "Distance:", nearest.dist);
        setInsidePoi(nearest.poi);
        cooldownUntilRef.current = now + cooldownMs;

        listenersRef.current.forEach((fn) =>
          fn({ type: "enter", poi: nearest!.poi, distance: nearest!.dist })
        );
      } else {
        setInsidePoi(nearest.poi);
      }
    }
  }, [position, pois, insidePoi, radiusDefault, cooldownMs]);

  const onEvent = (handler: (e: GeofenceEvent) => void) => {
    listenersRef.current.push(handler);
    return () => {
      listenersRef.current = listenersRef.current.filter((h) => h !== handler);
    };
  };

  return { position, insidePoi, onEvent };
}

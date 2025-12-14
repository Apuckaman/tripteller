import { useEffect, useRef, useState } from "react";
import { haversineMeters } from "../lib/geo";
import type { Poi } from "../lib/pois";

type GeofenceEvent = { type: "enter" | "exit" | "approaching"; poi: Poi; distance: number };

type Options = {
  radiusDefault?: number;
  highAccuracy?: boolean;
  cooldownMs?: number;
  accuracyMax?: number;
  approachingDistance?: number; // Távolság méterben, amikor közeledésnek számít
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
    approachingDistance = 300, // 300m közeledés
  } = opts;

  const [position, setPosition] = useState<{ lat: number; lng: number } | null>(
    null
  );
  const [insidePoi, setInsidePoi] = useState<Poi | null>(null);
  const [approachingPoi, setApproachingPoi] = useState<{ poi: Poi; distance: number } | null>(null);

  const watchIdRef = useRef<number | null>(null);
  const listenersRef = useRef<Array<(e: GeofenceEvent) => void>>([]);
  const cooldownUntilRef = useRef<number>(0);
  const approachingCooldownRef = useRef<Record<number, number>>({}); // POI ID -> timestamp

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
    let nearest: { poi: Poi; distance: number } | null = null;
    let nearestApproaching: { poi: Poi; distance: number } | null = null;

    console.log("📍 CHECKING POIS - User position:", position);

    for (const p of pois) {
      const r = p.radius ?? radiusDefault;
      const d = haversineMeters(position.lat, position.lng, p.lat, p.lng);
      console.log(`   📍 ${p.name}: ${d}m / ${r}m radius`);

      // Belépés észlelése
      if (d <= r && (!nearest || d < nearest.distance)) {
        nearest = { poi: p, distance: d };
      }

      // Közeledés észlelése (kívül van a körzeten, de közel)
      if (d > r && d <= approachingDistance && (!nearestApproaching || d < nearestApproaching.distance)) {
        nearestApproaching = { poi: p, distance: d };
      }
    }

    const wasInside = !!insidePoi;
    const currentlyInside = !!nearest;
    const prevApproachingPoi = approachingPoi;

    // KILÉPÉS
    if (!currentlyInside && wasInside) {
      const prev = insidePoi!;
      console.log("🚪 EXIT POI:", prev.name);
      setInsidePoi(null);
      setApproachingPoi(null);
      listenersRef.current.forEach((fn: (e: GeofenceEvent) => void) =>
        fn({ type: "exit", poi: prev, distance: Infinity })
      );
      return;
    }

    // BELÉPÉS
    if (nearest) {
      if (!wasInside && now >= cooldownUntilRef.current) {
        console.log("🚪 ENTER POI:", nearest.poi.name, "Distance:", nearest.distance);
        setInsidePoi(nearest.poi);
        setApproachingPoi(null); // Belépéskor nincs már közeledés
        cooldownUntilRef.current = now + cooldownMs;

        listenersRef.current.forEach((fn: (e: GeofenceEvent) => void) =>
          fn({ type: "enter", poi: nearest!.poi, distance: nearest!.distance })
        );
      } else {
        setInsidePoi(nearest.poi);
      }
    }

    // KÖZELEDÉS (csak ha nincs belépés)
    if (!currentlyInside && nearestApproaching) {
      const wasApproachingSame = prevApproachingPoi?.poi.id === nearestApproaching.poi.id;
      const approachingCooldown = approachingCooldownRef.current[nearestApproaching.poi.id] || 0;
      
      if (!wasApproachingSame || (now >= approachingCooldown && Math.abs((prevApproachingPoi?.distance || 0) - nearestApproaching.distance) > 50)) {
        console.log("🎯 APPROACHING POI:", nearestApproaching.poi.name, "Distance:", nearestApproaching.distance);
        setApproachingPoi(nearestApproaching);
        approachingCooldownRef.current[nearestApproaching.poi.id] = now + cooldownMs;
        
        listenersRef.current.forEach((fn: (e: GeofenceEvent) => void) =>
          fn({ type: "approaching", poi: nearestApproaching!.poi, distance: nearestApproaching!.distance })
        );
      } else {
        setApproachingPoi(nearestApproaching);
      }
    } else if (!nearestApproaching && prevApproachingPoi) {
      setApproachingPoi(null);
    }
  }, [position, pois, insidePoi, approachingPoi, radiusDefault, approachingDistance, cooldownMs]);

  const onEvent = (handler: (e: GeofenceEvent) => void) => {
    listenersRef.current.push(handler);
    return () => {
      listenersRef.current = listenersRef.current.filter((h: (e: GeofenceEvent) => void) => h !== handler);
    };
  };

  return { position, insidePoi, approachingPoi, onEvent };
}

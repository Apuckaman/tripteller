// src/hooks/useGeolocation.ts
import { useEffect, useState } from "react";

export type Geo = { lat: number; lng: number };

export function useGeolocation(defaultCenter: Geo = { lat: 47.4979, lng: 19.0402 }) {
  const [pos, setPos] = useState<Geo | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setError("A böngésző nem támogatja a geolokációt.");
      setPos(defaultCenter);
      return;
    }

    const watchId = navigator.geolocation.watchPosition(
      (p) => {
        setPos({ lat: p.coords.latitude, lng: p.coords.longitude });
        setError(null);
      },
      (err) => {
        setError(err.message || "Geolokációs hiba");
        setPos(defaultCenter); // legalább ne essen szét a nézet
      },
      {
        enableHighAccuracy: true,
        maximumAge: 10_000, // legfeljebb 10 mp-es cache
        timeout: 10_000,
      }
    );

    return () => {
      try {
        navigator.geolocation.clearWatch(watchId);
      } catch {}
    };
  }, [defaultCenter.lat, defaultCenter.lng]);

  return { pos, error };
}

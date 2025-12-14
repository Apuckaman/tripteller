export type Poi = {
  id: number;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  audioUrl?: string;
  ttsText?: string;
};

const STRAPI_URL = import.meta.env.VITE_STRAPI_URL || "http://localhost:1337";

// POI2 mapping - nincs audio mező
function mapOne(item: any): Poi {
  // 1) Lapos formátum (Strapi 5 default)
  if (item && typeof item.name === "string") {
    return {
      id: item.id,
      name: item.name,
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lng) || 0,
      radius: parseFloat(item.radius) || 150,
      ttsText: undefined, // POI2-nek nincs ttsText mezője
      audioUrl: undefined, // POI2-nek nincs audio mezője
    };
  }
  // 2) Klasszikus (attributes-ben) - ha mégis így jön
  const a = item?.attributes ?? {};
  return {
    id: item.id,
    name: a.name || '',
    lat: parseFloat(a.lat) || 0,
    lng: parseFloat(a.lng) || 0,
    radius: parseFloat(a.radius) || 150,
    ttsText: undefined,
    audioUrl: undefined,
  };
}

export async function fetchPois(): Promise<Poi[]> {
  // POI2-nek nincs audio mező, ezért nem populate-oljuk
  const res = await fetch(`${STRAPI_URL}/api/poi2s?pagination[pageSize]=100`);
  if (!res.ok) {
    const errorText = await res.text();
    throw new Error(`POI fetch failed: ${res.status} - ${errorText}`);
  }
  const json = await res.json();
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr.map(mapOne);
}

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

// Olyan map, ami kezeli a "lapos" (a te) és az "attributes"-os (klasszikus) választ is.
function mapOne(item: any): Poi {
  // 1) Lapos (amit te kaptál)
  if (item && typeof item.name === "string") {
    const audioUrlRel = item?.audio?.url;
    return {
      id: item.id,
      name: item.name,
      lat: item.lat,
      lng: item.lng,
      radius: item.radius ?? 150,
      ttsText: item.ttstext ?? item.ttsText ?? undefined,
      audioUrl: audioUrlRel ? `${STRAPI_URL}${audioUrlRel}` : undefined,
    };
  }
  // 2) Klasszikus (attributes-ben)
  const a = item?.attributes ?? {};
  const rel = a?.audio?.data?.attributes?.url;
  return {
    id: item.id,
    name: a.name,
    lat: a.lat,
    lng: a.lng,
    radius: a.radius ?? 150,
    ttsText: a.ttsText ?? undefined,
    audioUrl: rel ? `${STRAPI_URL}${rel}` : undefined,
  };
}

export async function fetchPois(): Promise<Poi[]> {
  const res = await fetch(`${STRAPI_URL}/api/pois?populate=audio&pagination[pageSize]=100`);
  if (!res.ok) throw new Error(`POI fetch failed: ${res.status}`);
  const json = await res.json();
  const arr = Array.isArray(json?.data) ? json.data : [];
  return arr.map(mapOne);
}

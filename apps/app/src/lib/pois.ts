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

// Extract text from Strapi blocks field
function extractTextFromBlocks(blocks: any): string | undefined {
  if (!blocks || !Array.isArray(blocks)) return undefined;
  
  const texts: string[] = [];
  
  function traverse(block: any) {
    if (typeof block === 'string') {
      texts.push(block);
      return;
    }
    if (typeof block !== 'object' || block === null) return;
    
    // Strapi blocks structure: { type: 'paragraph', children: [{ type: 'text', text: '...' }] }
    if (block.text) {
      texts.push(block.text);
    }
    if (block.children && Array.isArray(block.children)) {
      block.children.forEach(traverse);
    }
    if (Array.isArray(block)) {
      block.forEach(traverse);
    }
  }
  
  blocks.forEach(traverse);
  
  const result = texts.filter(t => t && t.trim()).join(' ').trim();
  return result || undefined;
}

// POI2 mapping - használja az intro, interesting_facts, legends mezőket TTS-hez
function mapOne(item: any): Poi {
  // 1) Lapos formátum (Strapi 5 default)
  if (item && typeof item.name === "string") {
    // Try to extract text from blocks fields (priority: intro > interesting_facts > legends)
    const ttsText = extractTextFromBlocks(item.intro) 
      || extractTextFromBlocks(item.interesting_facts) 
      || extractTextFromBlocks(item.legends);
    
    return {
      id: item.id,
      name: item.name,
      lat: parseFloat(item.lat) || 0,
      lng: parseFloat(item.lng) || 0,
      radius: parseFloat(item.radius) || 150,
      ttsText: ttsText,
      audioUrl: undefined, // POI2-nek nincs audio mezője
    };
  }
  // 2) Klasszikus (attributes-ben) - ha mégis így jön
  const a = item?.attributes ?? {};
  const ttsText = extractTextFromBlocks(a.intro) 
    || extractTextFromBlocks(a.interesting_facts) 
    || extractTextFromBlocks(a.legends);
  
  return {
    id: item.id,
    name: a.name || '',
    lat: parseFloat(a.lat) || 0,
    lng: parseFloat(a.lng) || 0,
    radius: parseFloat(a.radius) || 150,
    ttsText: ttsText,
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

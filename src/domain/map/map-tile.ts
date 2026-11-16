/**
 * The map tiles Meri relays from Tianditu to the browser (1.2104): Web Mercator tiles of the
 * street map (vec) with its Chinese labels (cva). English labels (eva) are not relayed: Tianditu's
 * firewall refused them on 2026-11-16, and asking again would only add refusals. Only these
 * layers, sensible zooms and tiles touching China are relayed, so the relay is no use as a
 * general map service.
 */
export const mapTileLayers = ["vec", "cva"] as const;
export type MapTileLayer = (typeof mapTileLayers)[number];

export type MapTile = { readonly layer: MapTileLayer; readonly z: number; readonly x: number; readonly y: number };

export const minTileZoom = 3;
export const maxTileZoom = 18;

/** Mainland China with its islands and seas, generously: longitude 73–136, latitude 3–54. */
const china = { west: 73, east: 136, south: 3, north: 54 };

function wholeNumber(value: string): number | null {
  return /^\d{1,7}$/u.test(value) ? Number(value) : null;
}

/** The tile's corners in degrees, from its Web Mercator column and row. */
export function tileBounds({ z, x, y }: Pick<MapTile, "z" | "x" | "y">): { west: number; east: number; south: number; north: number } {
  const count = 2 ** z;
  const longitude = (column: number) => (column / count) * 360 - 180;
  const latitude = (row: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * row) / count))) * 180) / Math.PI;
  return { west: longitude(x), east: longitude(x + 1), north: latitude(y), south: latitude(y + 1) };
}

export function touchesChina(tile: Pick<MapTile, "z" | "x" | "y">): boolean {
  const bounds = tileBounds(tile);
  return bounds.east > china.west && bounds.west < china.east && bounds.north > china.south && bounds.south < china.north;
}

/** The tile the path names, or null for anything Meri does not relay. */
export function parseMapTile(params: { layer: string; z: string; x: string; y: string }): MapTile | null {
  const layer = mapTileLayers.find((name) => name === params.layer);
  const z = wholeNumber(params.z);
  const x = wholeNumber(params.x);
  // Leaflet asks for "{y}.png" style names; only the number is read.
  const y = wholeNumber(params.y.replace(/\.png$/u, ""));
  if (!layer || z === null || x === null || y === null) return null;
  if (z < minTileZoom || z > maxTileZoom || x >= 2 ** z || y >= 2 ** z) return null;
  const tile = { layer, z, x, y };
  return touchesChina(tile) ? tile : null;
}

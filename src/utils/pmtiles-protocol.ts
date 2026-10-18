import maplibregl from 'maplibre-gl';
import { Protocol } from 'pmtiles';

/**
 * Teaches MapLibre the `pmtiles://` scheme. Our own base map ships as a single
 * PMTiles archive instead of a tile endpoint, so without this the style loads
 * and then renders nothing — MapLibre simply does not know how to fetch the
 * source. Registering is global and must happen before the first map mounts.
 */
export const registerPMTilesProtocol = (): void => {
  maplibregl.addProtocol('pmtiles', new Protocol().tile);
};

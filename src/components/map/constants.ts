const centerCoords = import.meta.env.VITE_CENTER_COORDS?.split(',') || [];

export const DEFAULT_CENTER: [number, number] = [
  parseFloat(centerCoords[1] || '13.393707'),
  parseFloat(centerCoords[0] || '52.51831'),
];

export const DEFAULT_ZOOM = 10;

export const maxBounds: [[number, number], [number, number]] | undefined =
  undefined;

export const routeObjects = {
  color: '#3b82f6',
  alternativeColor: '#66a3ff',
  inactiveColor: '#66a3ff',
};

export const MAP_STYLE_STORAGE_KEY = 'selectedMapStyle';
// A custom style is held as *either* a URL (fetched fresh by MapLibre on every
// load, so edits on the style server show up) or an inlined spec (the only
// option for a style picked off disk). The URL wins when both are present.
export const CUSTOM_STYLE_STORAGE_KEY = 'customMapStyle';
export const CUSTOM_STYLE_URL_STORAGE_KEY = 'customMapStyleUrl';
export const CUSTOM_STYLE_NAME_STORAGE_KEY = 'customMapStyleName';

const assetPath = (path: string) => `${import.meta.env.BASE_URL}${path}`;

// Our own base map. The style server sends no CORS headers, so dev goes
// through the Vite proxy (see vite.config.ts) while a build talks to it
// directly — which needs Access-Control-Allow-Origin on that server. Set
// VITE_BASE_MAP_URL to point either mode somewhere else.
export const BASE_MAP_URL =
  import.meta.env.VITE_BASE_MAP_URL ||
  (import.meta.env.DEV
    ? '/base-map/prod/v1'
    : 'https://base-map.blaulichtnavi.de/prod/v1');

export const MAP_STYLES = [
  {
    id: 'shortbread',
    label: 'Shortbread',
    style: assetPath('styles/versatiles-colorful.json'),
  },
  { id: 'carto', label: 'Carto', style: assetPath('styles/carto.json') },
  {
    id: 'alidade-smooth',
    label: 'Alidade Smooth',
    style: 'https://tiles.stadiamaps.com/styles/alidade_smooth.json',
  },
  {
    id: 'krawana-light',
    label: 'Krawana Light',
    style: `${BASE_MAP_URL}/style-light.json`,
  },
  {
    id: 'krawana-dark',
    label: 'Krawana Dark',
    style: `${BASE_MAP_URL}/style-dark.json`,
  },
] as const;

export const DEFAULT_MAP_STYLE = MAP_STYLES[0].style;
export const DEFAULT_MAP_STYLE_ID = MAP_STYLES[0].id;
export const MAP_STYLE_IDS = MAP_STYLES.map((s) => s.id);
export const CLICK_DELAY_MS = 200;
export const DOUBLE_TAP_THRESHOLD_MS = 300;

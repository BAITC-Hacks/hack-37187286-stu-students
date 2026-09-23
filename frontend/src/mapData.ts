import type { StyleSpecification } from 'maplibre-gl'

export interface Landmark {
  name: string
  coordinates: [number, number] // [lng, lat]
  icon: string
  district: string
}

export const ASTANA_CENTER: [number, number] = [71.4305, 51.1350]
export const ASTANA_BOUNDS: [[number, number], [number, number]] = [
  [71.212, 51.003], // Southwest
  [71.740, 51.290], // Northeast
]

export const DISTRICT_CENTERS: Record<string, [number, number]> = {
  'Есиль': [71.465, 51.085],
  'Нура': [71.340, 51.095],
  'Сарыарка': [71.365, 51.195],
  'Байконур': [71.465, 51.205],
  'Алматы': [71.560, 51.170],
}

export const LANDMARKS: Landmark[] = [
  { name: 'Монумент Байтерек', coordinates: [71.4305, 51.1283], icon: '🏛️', district: 'Есиль' },
  { name: 'ТРЦ Хан Шатыр', coordinates: [71.4037, 51.1325], icon: '⛺', district: 'Нура' },
  { name: 'EXPO 2017 / Mega Silk Way', coordinates: [71.4170, 51.0898], icon: '🌐', district: 'Есиль' },
  { name: 'Озеро Большой Талдыколь', coordinates: [71.3450, 51.0950], icon: '💧', district: 'Нура' },
  { name: 'Микрорайон Жагалау', coordinates: [71.3850, 51.1180], icon: '🏢', district: 'Нура' },
  { name: 'Шоссе Коргалжын', coordinates: [71.3700, 51.0750], icon: '🛣️', district: 'Нура' },
  { name: 'Старый Ж/Д Вокзал', coordinates: [71.4019, 51.1983], icon: '🚉', district: 'Сарыарка' },
  { name: 'Набережная р. Есиль', coordinates: [71.4190, 51.1610], icon: '🌊', district: 'Сарыарка' },
  { name: 'Проспект Республики', coordinates: [71.4250, 51.1750], icon: '🚦', district: 'Сарыарка' },
  { name: 'ТЭЦ-2 / Промзона', coordinates: [71.4850, 51.1850], icon: '🏭', district: 'Байконур' },
  { name: 'Шоссе Алаш', coordinates: [71.4650, 51.2150], icon: '🚚', district: 'Байконур' },
  { name: 'Рынок Сапар / Шанхай', coordinates: [71.4450, 51.1750], icon: '📦', district: 'Байконур' },
  { name: 'Мечеть Хазрет Султан', coordinates: [71.4721, 51.1259], icon: '🕌', district: 'Алматы' },
  { name: 'Вокзал Нурлы Жол', coordinates: [71.5367, 51.1165], icon: '🚅', district: 'Алматы' },
  { name: 'Дворец Мира и Согласия', coordinates: [71.4641, 51.1232], icon: '🔺', district: 'Алматы' },
]

export interface DistrictFeature {
  type: 'Feature'
  id: string
  properties: {
    name: string
    color: string
    score: number
    isSelected: boolean
    hasCrit: boolean
    popShare: number
  }
  geometry: {
    type: 'Polygon'
    coordinates: [number, number][][]
  }
}

export interface DistrictFeatureCollection {
  type: 'FeatureCollection'
  features: DistrictFeature[]
}

/**
 * Realistic contiguous polygons for all 5 administrative districts of Astana:
 * - Natural dividing line: Ishim / Esil river separates Right Bank (Saryarka, Baykonur, Almaty)
 *   from Left Bank (Nura, Esil).
 * - Kabanbay Batyr & Turan avenues separate Nura (West) from Esil (Central & East).
 * - Respublika / Alash highway separates Saryarka from Baykonur.
 * - Pushkin / Akzhol separates Baykonur from Almaty.
 * Full contiguous tiling covering the entire metropolitan perimeter without gaps.
 */
export const DISTRICT_POLYGONS: Record<string, [number, number][]> = {
  'Сарыарка': [
    [71.212, 51.160],
    [71.212, 51.240],
    [71.280, 51.270],
    [71.360, 51.285],
    [71.415, 51.275],
    [71.425, 51.220],
    [71.428, 51.185],
    [71.428, 51.165],
    [71.418, 51.158],
    [71.380, 51.162],
    [71.320, 51.165],
    [71.250, 51.160],
    [71.212, 51.160],
  ],
  'Байконур': [
    [71.418, 51.158],
    [71.428, 51.165],
    [71.428, 51.185],
    [71.425, 51.220],
    [71.415, 51.275],
    [71.460, 51.285],
    [71.520, 51.275],
    [71.510, 51.220],
    [71.490, 51.175],
    [71.485, 51.140],
    [71.460, 51.120],
    [71.455, 51.135],
    [71.435, 51.148],
    [71.418, 51.158],
  ],
  'Алматы': [
    [71.460, 51.120],
    [71.485, 51.140],
    [71.490, 51.175],
    [71.510, 51.220],
    [71.520, 51.275],
    [71.600, 51.285],
    [71.740, 51.260],
    [71.740, 51.130],
    [71.680, 51.115],
    [71.620, 51.108],
    [71.540, 51.110],
    [71.500, 51.115],
    [71.460, 51.120],
  ],
  'Нура': [
    [71.212, 51.160],
    [71.250, 51.160],
    [71.320, 51.165],
    [71.380, 51.162],
    [71.418, 51.158],
    [71.415, 51.148],
    [71.410, 51.135],
    [71.400, 51.110],
    [71.380, 51.070],
    [71.370, 51.020],
    [71.330, 51.003],
    [71.212, 51.003],
    [71.212, 51.160],
  ],
  'Есиль': [
    [71.418, 51.158],
    [71.435, 51.148],
    [71.455, 51.135],
    [71.460, 51.120],
    [71.500, 51.115],
    [71.540, 51.110],
    [71.620, 51.108],
    [71.680, 51.115],
    [71.740, 51.130],
    [71.740, 51.003],
    [71.330, 51.003],
    [71.370, 51.020],
    [71.380, 51.070],
    [71.400, 51.110],
    [71.410, 51.135],
    [71.415, 51.148],
    [71.418, 51.158],
  ],
}

/**
 * Returns a standalone MapLibre style specification tuned for Astana OSM MBTiles.
 */
export function createAstanaMapStyle(tileUrl: string): StyleSpecification {
  return {
    version: 8,
    name: 'Astana OpenMapTiles Style',
    sources: {
      openmaptiles: {
        type: 'vector',
        tiles: [tileUrl],
        minzoom: 0,
        maxzoom: 14,
        bounds: [71.212, 51.003, 71.740, 51.290],
      },
    },
    layers: [
      {
        id: 'osm-background',
        type: 'background',
        paint: {
          'background-color': '#f8fafc',
        },
      },
      {
        id: 'osm-landcover',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landcover',
        paint: {
          'fill-color': '#f1f5f9',
          'fill-opacity': 0.7,
        },
      },
      {
        id: 'osm-landuse',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'landuse',
        paint: {
          'fill-color': '#f8fafc',
          'fill-opacity': 0.5,
        },
      },
      {
        id: 'osm-park',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'park',
        paint: {
          'fill-color': '#bbf7d0',
          'fill-opacity': 0.6,
        },
      },
      {
        id: 'osm-water',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'water',
        paint: {
          'fill-color': '#38bdf8',
          'fill-opacity': 0.85,
        },
      },
      {
        id: 'osm-waterway',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'waterway',
        paint: {
          'line-color': '#0284c7',
          'line-width': 2.5,
        },
      },
      {
        id: 'osm-building',
        type: 'fill',
        source: 'openmaptiles',
        'source-layer': 'building',
        minzoom: 12,
        paint: {
          'fill-color': '#e2e8f0',
          'fill-outline-color': '#cbd5e1',
          'fill-opacity': 0.8,
        },
      },
      {
        id: 'osm-transportation-casing',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        paint: {
          'line-color': '#cbd5e1',
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 1.2, 14, 4],
        },
      },
      {
        id: 'osm-transportation',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'transportation',
        paint: {
          'line-color': [
            'match',
            ['get', 'class'],
            'motorway', '#f59e0b',
            'trunk', '#fbbf24',
            'primary', '#ffffff',
            'secondary', '#ffffff',
            '#ffffff',
          ],
          'line-width': ['interpolate', ['linear'], ['zoom'], 9, 0.8, 14, 2.8],
        },
      },
      {
        id: 'osm-boundary',
        type: 'line',
        source: 'openmaptiles',
        'source-layer': 'boundary',
        paint: {
          'line-color': '#94a3b8',
          'line-width': 1.5,
          'line-dasharray': [3, 2],
        },
      },
    ],
  }
}

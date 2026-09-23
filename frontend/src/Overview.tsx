import { useState, useRef, useEffect, useCallback } from 'react'
import 'maplibre-gl/dist/maplibre-gl.css'
import * as maplibregl from 'maplibre-gl'
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?worker&url'

// Tell MapLibre to use the bundled worker in Vite
if (typeof (maplibregl as unknown as { setWorkerUrl?: (url: string) => void }).setWorkerUrl === 'function') {
  (maplibregl as unknown as { setWorkerUrl: (url: string) => void }).setWorkerUrl(workerUrl)
}
import {
  ArrowRight,
  ArrowUpRight,
  Building2,
  CircleAlert,
  Compass,
  Layers,
  MapPin,
  Maximize2,
  Minimize2,
  RotateCcw,
  Sparkles,
  Target,
  Wallet,
  ZoomIn,
  ZoomOut,
} from 'lucide-react'
import { format } from './api'
import { CITY_DOMAINS, directionIcon, Stat } from './components'
import {
  ASTANA_CENTER,
  ASTANA_BOUNDS,
  DISTRICT_CENTERS,
  DISTRICT_POLYGONS,
  LANDMARKS,
  createAstanaMapStyle,
} from './mapData'
import type { CityContext, Page } from './types'

type MapLayer = 'all' | 'Транспорт' | 'Экология' | 'Соцсфера' | 'Безопасность' | 'Сервисы'

export default function Overview({
  context,
  selectedCount,
  go,
  demo,
}: {
  context: CityContext
  selectedCount: number
  go: (page: Page) => void
  demo: () => void
}) {
  const [active, setActive] = useState(context.baseline.weakest_district)
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all')

  // Interactive Zoom & GIS Controls
  const [zoomLevel, setZoomLevel] = useState(11)
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [isMapLoaded, setIsMapLoaded] = useState(false)

  const mapContainerRef = useRef<HTMLDivElement | null>(null)
  const mapRef = useRef<maplibregl.Map | null>(null)
  const districtMarkersRef = useRef<maplibregl.Marker[]>([])
  const landmarkMarkersRef = useRef<maplibregl.Marker[]>([])

  const district = context.districts.find(d => d.name === active) ?? context.districts[0]
  const critical = context.baseline.critical.filter(c => c.district === district.name)
  const weak = Object.entries(district.indicators)
    .sort((a, b) => a[1] - b[1])
    .slice(0, 4)

  const getDistrictLayerValue = useCallback(
    (distName: string): number => {
      const dist = context.districts.find(d => d.name === distName)
      if (!dist) return 50
      if (activeLayer === 'all') {
        return context.baseline.district_scores[distName] ?? 50
      }
      const domainDef = CITY_DOMAINS.find(d => d.id === activeLayer)
      if (!domainDef) return 50
      const vals = domainDef.indicators.map(ind => dist.indicators[ind] ?? 50)
      return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
    },
    [context, activeLayer]
  )

  const getHeatmapColor = useCallback(
    (score: number, isSelected: boolean) => {
      if (isSelected) return '#059669' // Selected emerald
      if (score < 45) return '#fca5a5' // Critical red
      if (score < 55) return '#fed7aa' // Warning amber
      if (score < 65) return '#bbf7d0' // Balanced light green
      return '#86efac' // Strong green
    },
    []
  )

  // Construct GeoJSON FeatureCollection for the 5 Astana districts
  const buildDistrictsGeoJson = useCallback((): GeoJSON.FeatureCollection => {
    return {
      type: 'FeatureCollection',
      features: Object.entries(DISTRICT_POLYGONS).map(([name, coords]) => {
        const score = getDistrictLayerValue(name)
        const isSelected = active === name
        const distData = context.districts.find(d => d.name === name)
        const hasCrit = context.baseline.critical.some(c => c.district === name)

        return {
          type: 'Feature',
          id: name,
          properties: {
            name,
            color: getHeatmapColor(score, isSelected),
            score,
            isSelected,
            hasCrit,
            popShare: distData ? Math.round(distData.population_share * 100) : 20,
          },
          geometry: {
            type: 'Polygon',
            coordinates: [coords],
          },
        }
      }),
    }
  }, [active, getDistrictLayerValue, getHeatmapColor, context])

  // Center on district handler
  const centerOnDistrict = useCallback((distName: string) => {
    setActive(distName)
    const center = DISTRICT_CENTERS[distName]
    if (center && mapRef.current) {
      mapRef.current.flyTo({
        center,
        zoom: 12.2,
        speed: 1.2,
        curve: 1.4,
      })
    }
  }, [])

  // Initialize MapLibre GL
  useEffect(() => {
    if (!mapContainerRef.current) return
    if (mapRef.current) return

    const tileUrl = `${window.location.origin}/api/tiles/{z}/{x}/{y}.pbf`
    const style = createAstanaMapStyle(tileUrl)
    const map = new maplibregl.Map({
      container: mapContainerRef.current,
      style,
      center: ASTANA_CENTER,
      maxBounds: ASTANA_BOUNDS,
      zoom: 11,
      minZoom: 9,
      maxZoom: 14.5,
      attributionControl: false,
    })

    requestAnimationFrame(() => {
      map.resize()
    })

    map.on('zoom', () => {
      setZoomLevel(Math.round(map.getZoom() * 10) / 10)
    })

    map.on('load', () => {
      // Add GeoJSON source for the 5 Astana districts
      map.addSource('astana-districts', {
        type: 'geojson',
        data: buildDistrictsGeoJson(),
      })

      // District Fill Layer with heatmap coloring
      map.addLayer({
        id: 'districts-fill',
        type: 'fill',
        source: 'astana-districts',
        paint: {
          'fill-color': ['get', 'color'],
          'fill-opacity': 0.38,
        },
      })

      // District Border Outline
      map.addLayer({
        id: 'districts-line',
        type: 'line',
        source: 'astana-districts',
        paint: {
          'line-color': ['case', ['get', 'isSelected'], '#064e3b', '#ffffff'],
          'line-width': ['case', ['get', 'isSelected'], 4, 2],
        },
      })

      // Click district polygon to select
      map.on('click', 'districts-fill', (e: maplibregl.MapLayerMouseEvent) => {
        const feature = e.features?.[0]
        if (feature?.properties?.name) {
          centerOnDistrict(feature.properties.name as string)
        }
      })

      // Hover cursor
      map.on('mouseenter', 'districts-fill', () => {
        map.getCanvas().style.cursor = 'pointer'
      })
      map.on('mouseleave', 'districts-fill', () => {
        map.getCanvas().style.cursor = ''
      })

      mapRef.current = map
      setIsMapLoaded(true)
    })

    const resizeObserver = new ResizeObserver(() => {
      map.resize()
    })
    if (mapContainerRef.current) {
      resizeObserver.observe(mapContainerRef.current)
    }

    return () => {
      resizeObserver.disconnect()
      map.remove()
      mapRef.current = null
    }
  }, [buildDistrictsGeoJson, centerOnDistrict])

  // Update GeoJSON source when active district or layer changes
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return
    const source = mapRef.current.getSource('astana-districts') as maplibregl.GeoJSONSource | undefined
    if (source) {
      source.setData(buildDistrictsGeoJson())
    }
  }, [buildDistrictsGeoJson, isMapLoaded])

  // Render & Update District HTML Markers
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    // Clean up old markers
    districtMarkersRef.current.forEach(m => m.remove())
    districtMarkersRef.current = []

    // Create markers for the 5 districts
    Object.entries(DISTRICT_CENTERS).forEach(([name, coords]) => {
      const isSelected = active === name
      const score = getDistrictLayerValue(name)
      const distData = context.districts.find(d => d.name === name)
      const hasCrit = context.baseline.critical.some(c => c.district === name)
      const popShare = distData ? Math.round(distData.population_share * 100) : 20

      const el = document.createElement('div')
      el.className = `gis-marker-badge ${isSelected ? 'active' : ''}`
      el.innerHTML = `
        <div class="gis-marker-inner">
          <span class="gis-marker-name">${name}</span>
          <span class="gis-marker-score">${format(score, 1)} б.</span>
          ${hasCrit ? '<span class="gis-marker-crit" title="Критическая зона">!</span>' : ''}
        </div>
        <div class="gis-marker-pop">${popShare}% жителей</div>
      `
      el.onclick = () => centerOnDistrict(name)

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(coords)
        .addTo(mapRef.current!)

      districtMarkersRef.current.push(marker)
    })
  }, [active, activeLayer, isMapLoaded, getDistrictLayerValue, context, centerOnDistrict])

  // Render Landmark HTML Markers
  useEffect(() => {
    if (!mapRef.current || !isMapLoaded) return

    // Clean up old landmark markers
    landmarkMarkersRef.current.forEach(m => m.remove())
    landmarkMarkersRef.current = []

    if (!showLandmarks) return

    LANDMARKS.forEach(lm => {
      const el = document.createElement('div')
      el.className = 'gis-landmark-marker'
      el.innerHTML = `
        <div class="gis-landmark-icon" title="${lm.name}">${lm.icon}</div>
        <div class="gis-landmark-title">${lm.name}</div>
      `

      const marker = new maplibregl.Marker({ element: el, anchor: 'center' })
        .setLngLat(lm.coordinates)
        .addTo(mapRef.current!)

      landmarkMarkersRef.current.push(marker)
    })
  }, [showLandmarks, isMapLoaded])

  // Resize map when entering/exiting fullscreen
  useEffect(() => {
    if (mapRef.current) {
      setTimeout(() => {
        mapRef.current?.resize()
      }, 50)
    }
  }, [isFullscreen])

  // Zoom handlers
  const handleZoomIn = () => mapRef.current?.zoomIn()
  const handleZoomOut = () => mapRef.current?.zoomOut()
  const handleResetView = () => {
    mapRef.current?.flyTo({
      center: ASTANA_CENTER,
      zoom: 11,
      speed: 1.2,
    })
  }

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">СИТУАЦИОННЫЙ ЦЕНТР АСТАНЫ · ИСХОДНОЕ СОСТОЯНИЕ</div>
          <h1>Управление качеством жизни столицы</h1>
          <p>5 направлений развития, 5 районов города, фиксированный виртуальный бюджет 100 единиц.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={demo}>
            Загрузить эталонное демо <ArrowUpRight size={17} />
          </button>
          <button className="button primary" onClick={() => go('builder')}>
            Начать стратегию <ArrowRight size={17} />
          </button>
        </div>
      </div>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag">
            <span /> СИМУЛЯТОР «АКИМ НА 5 ЧАСОВ»
          </div>
          <h2>
            Пять выверенных решений.
            <br />
            <span>Сбалансированный город.</span>
          </h2>
          <p>
            Распределите 100 единиц бюджета между транспортом, экологией, соцсферой, безопасностью и ЖКХ. Модель
            рассчитает единый <strong>Astana Quality of Life Score</strong> и вскроет скрытые риски.
          </p>
          <div className="hero-buttons">
            <button className="button lime" onClick={() => go('builder')}>
              Собрать свой план <ArrowRight size={18} />
            </button>
            <button className="button secondary" onClick={() => go('crisis')}>
              Стресс-тест форс-мажоров <Sparkles size={16} />
            </button>
          </div>
        </div>
        <div className="city-art" aria-hidden="true">
          <svg viewBox="0 0 500 280" fill="none">
            <defs>
              <linearGradient id="cityfade" x1="240" y1="40" x2="240" y2="280" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10b981" stopOpacity=".8" />
                <stop offset="1" stopColor="#064e3b" stopOpacity=".1" />
              </linearGradient>
            </defs>
            <ellipse cx="260" cy="252" rx="229" ry="18" stroke="#10b981" strokeOpacity=".4" />
            <path d="M25 252H478M41 261H445" stroke="#10b981" strokeOpacity=".3" />
            <circle cx="299" cy="91" r="61" stroke="#34d399" strokeOpacity=".15" />
            <circle cx="299" cy="91" r="81" stroke="#34d399" strokeOpacity=".08" />
            <path
              d="M49 249V152L89 128L129 152V249M63 153V235M76 143V234M91 142V235M107 153V235M134 249V178H171V249M142 189H163M142 201H163M142 213H163M142 225H163M183 249V148L211 130L239 148V249M194 157V235M210 148V235M225 157V235M261 249L283 112M335 249L314 112M285 112H312M274 165H324M269 186H328M265 207H331M257 229H339M346 249V166H379V249M354 176H370M354 190H370M354 204H370M354 218H370M393 249V152H426V249M409 151V130M401 165H418M401 180H418M401 195H418M401 210H418M441 249V194H466V249"
              stroke="url(#cityfade)"
              strokeWidth="1.8"
            />
            <circle cx="299" cy="91" r="25" fill="#10b981" fillOpacity=".2" stroke="#34d399" strokeWidth="1.5" />
            <ellipse cx="299" cy="91" rx="13" ry="25" stroke="#34d399" strokeOpacity=".6" />
          </svg>
          <div className="art-coordinate">ASTANA · SITUATION CENTER</div>
        </div>
        <div className="hero-corner">
          ASTANA
          <br />
          <span>URBAN STRATEGY</span>
        </div>
      </section>

      <section className="stats-grid" aria-label="Исходные показатели">
        <Stat
          label="Базовый AQLS Score"
          value={format(context.baseline.score)}
          caption="Astana Quality of Life Score"
          icon={<Target size={19} />}
          tone="featured"
        >
          <div className="mini-progress">
            <i style={{ width: `${context.baseline.score}%` }} />
          </div>
        </Stat>
        <Stat
          label="Лимит бюджета"
          value={
            <>
              {context.budget}
              <span>ед.</span>
            </>
          }
          caption="Единый для всех команд"
          icon={<Wallet size={19} />}
        />
        <Stat
          label="Выбрано решений"
          value={
            <>
              {selectedCount}
              <span>/ {context.constraints.decision_count}</span>
            </>
          }
          caption="Ровно 5 инициатив"
          icon={<Layers size={19} />}
        />
        <Stat
          label="Критические зоны"
          value={context.baseline.critical.length}
          caption={`Ниже порога ${context.constraints.critical_threshold} баллов`}
          icon={<CircleAlert size={19} />}
          tone="attention"
        />
      </section>

      <section className="domains-strip" aria-label="5 направлений городского развития">
        {CITY_DOMAINS.map(domain => {
          const indList = domain.indicators.map(code => `${code}: ${context.indicators[code]?.name}`).join(' · ')
          return (
            <div key={domain.id} className="domain-card">
              <div className="domain-header">
                <span className="domain-icon" style={{ color: domain.color }}>
                  {directionIcon(domain.id, 18)}
                </span>
                <strong>{domain.name}</strong>
              </div>
              <div className="domain-sub">{indList}</div>
            </div>
          )
        })}
      </section>

      <section className="overview-grid">
        <div className={`panel city-panel ${isFullscreen ? 'gis-fullscreen' : ''}`}>
          <div className="panel-title">
            <div>
              <span className="eyebrow">ИНТЕРАКТИВНАЯ OPENSTREETMAP GIS-КАРТА АСТАНЫ</span>
              <h2>Реальная картографическая модель 5 районов (MBTiles)</h2>
            </div>

            <div className="gis-top-toolbar">
              <div className="map-layer-selector">
                <span className="small muted">Слой:</span>
                <select
                  aria-label="Аналитический слой карты"
                  value={activeLayer}
                  onChange={e => setActiveLayer(e.target.value as MapLayer)}
                >
                  <option value="all">Общий рейтинг районов (AQLS)</option>
                  <option value="Транспорт">Транспорт: пробки и доступность (T1, T2)</option>
                  <option value="Экология">Экология: озеленение и смог (E1, E2)</option>
                  <option value="Соцсфера">Соцсфера: школы и медицина (S1, S2)</option>
                  <option value="Безопасность">Безопасность: улицы и ДТП (B1, B2)</option>
                  <option value="Сервисы">Сервисы: надёжность ЖКХ и заявки (C1, C2)</option>
                </select>
              </div>

              <button
                className="icon-button"
                onClick={() => setShowLandmarks(!showLandmarks)}
                title={showLandmarks ? 'Скрыть ориентиры' : 'Показать ориентиры'}
              >
                <Compass size={17} />
              </button>

              <button
                className="icon-button"
                onClick={() => setIsFullscreen(!isFullscreen)}
                title={isFullscreen ? 'Свернуть карту' : 'Развернуть на весь экран'}
              >
                {isFullscreen ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          </div>

          <div className="city-panel-body">
            {/* 5 Astana Districts Quick Selection Strip */}
            <div className="district-tabs-strip" aria-label="Районы Астаны">
              {context.districts.map(d => {
                const score = getDistrictLayerValue(d.name)
                const hasCrit = context.baseline.critical.some(c => c.district === d.name)
                return (
                  <button
                    key={d.name}
                    className={`district-pill ${active === d.name ? 'active' : ''}`}
                    onClick={() => centerOnDistrict(d.name)}
                    aria-pressed={active === d.name}
                  >
                    <span className="pill-title">
                      <MapPin size={14} />
                      <strong>{d.name}</strong>
                      {hasCrit && <span className="crit-badge" title="Есть критический показатель">!</span>}
                    </span>
                    <span className="pill-score">{format(score, 1)} б.</span>
                  </button>
                )
              })}
            </div>

            {/* Real OpenStreetMap Vector Tile Map via MapLibre GL */}
            <div className="gis-viewport">
              {/* Floating Map Navigation Controls */}
              <div className="gis-floating-controls no-print">
                <button className="gis-control-btn" onClick={handleZoomIn} title="Увеличить (Zoom In)">
                  <ZoomIn size={16} />
                </button>
                <span className="gis-zoom-indicator">z{zoomLevel}</span>
                <button className="gis-control-btn" onClick={handleZoomOut} title="Уменьшить (Zoom Out)">
                  <ZoomOut size={16} />
                </button>
                <button className="gis-control-btn" onClick={handleResetView} title="Центр Астаны">
                  <RotateCcw size={15} />
                </button>
              </div>

              {/* MapLibre GL WebGL Map Container */}
              <div ref={mapContainerRef} className="gis-map-canvas" />

              {/* Map Status Badge */}
              <div className="gis-map-badge-status">
                OSM АСТАНА · ВЕКТОРНЫЕ ТАЙЛЫ MBTILES · СЛОЙ: {activeLayer.toUpperCase()}
              </div>
            </div>

            {/* Bottom Heatmap Gradient Key */}
            <div className="map-key">
              <div className="heat-legend">
                <span>Критический (&lt;45)</span>
                <div className="heat-bar" />
                <span>Высокий (&gt;65)</span>
              </div>
              <span className="key-active">
                <i className="green-dot" /> Выбран: <strong>{active}</strong> ({format(getDistrictLayerValue(active), 1)} б.)
              </span>
            </div>
          </div>
        </div>

        {/* Selected District Deep Inspector */}
        <aside className="panel district-detail">
          <div className="flex-between">
            <div className="icon-tile green">
              <Building2 size={22} />
            </div>
            <span className={`badge ${critical.length ? 'warning' : 'success'}`}>
              {critical.length ? `Критических зон: ${critical.length}` : 'Показатели в норме'}
            </span>
          </div>

          <h2>{district.name}</h2>
          <p className="district-profile">{district.profile}</p>

          <div className="district-number">
            <strong>{format(context.baseline.district_scores[district.name])}</strong>
            <span>общий балл района</span>
          </div>

          <div className="detail-divider" />
          <div className="small-label">УЗКИЕ МЕСТА ДЛЯ РЕШЕНИЙ АКИМА</div>
          <div className="indicator-list">
            {weak.map(([id, value]) => {
              const isCrit = critical.some(c => c.indicator === id)
              return (
                <div key={id}>
                  <div className="flex-between">
                    <span>
                      {context.indicators[id]?.name ?? id} <small className="muted">({id})</small>
                    </span>
                    <strong className={isCrit ? 'text-amber' : ''}>{format(value, 0)}</strong>
                  </div>
                  <div className={`indicator-track ${isCrit ? 'warning' : ''}`}>
                    <i style={{ width: `${Math.min(100, Math.max(10, value))}%` }} />
                  </div>
                </div>
              )
            })}
          </div>

          <button className="button primary full" style={{ marginTop: 24 }} onClick={() => go('builder')}>
            Подобрать решения для этого района <ArrowRight size={16} />
          </button>
        </aside>
      </section>

      <section className="advisor-strip">
        <div className="icon-tile">
          <Sparkles size={24} />
        </div>
        <div>
          <h3>Нужен советник при выборе стратегии?</h3>
          <p>
            AI Supervisor подбирает решения по заданному приоритету (максимальный скор, сбалансированность, спасение
            отстающего района).
          </p>
        </div>
        <button className="button secondary" onClick={() => go('advisor')}>
          Консультация с AI <ArrowUpRight size={17} />
        </button>
      </section>
    </div>
  )
}

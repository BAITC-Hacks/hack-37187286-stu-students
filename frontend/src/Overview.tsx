import { useState, useRef } from 'react'
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
import type { CityContext, Page } from './types'

// Enhanced SVG coordinates for the 5 Astana districts with realistic borders
const DETAILED_DISTRICTS = [
  {
    name: 'Есиль',
    center: { x: 550, y: 360 },
    // Southern/South-Eastern Left Bank with Expo, Baiterek, diplomatic zone
    path: 'M 440,245 C 475,230 540,235 595,215 C 640,200 680,225 735,260 C 765,280 780,335 770,390 C 755,445 700,500 645,525 C 585,550 515,530 465,475 C 430,435 425,370 430,315 Z',
    landmarks: [
      { name: 'Монумент Байтерек', x: 520, y: 285, icon: '🏛️' },
      { name: 'ТРЦ Хан Шатыр', x: 475, y: 310, icon: '⛺' },
      { name: 'EXPO 2017 / Mega Silk Way', x: 620, y: 400, icon: '🌐' },
    ],
  },
  {
    name: 'Нура',
    center: { x: 310, y: 440 },
    // South-Western district, lake Taldykol, Zhabalau, Korgalzhyn highway
    path: 'M 425,315 C 420,370 425,435 460,475 C 440,510 395,540 330,555 C 240,575 160,530 145,460 C 130,390 175,340 230,305 C 290,270 365,285 425,315 Z',
    landmarks: [
      { name: 'Озеро Большой Талдыколь', x: 260, y: 410, icon: '💧' },
      { name: 'Микрорайон Жагалау', x: 360, y: 375, icon: '🏢' },
      { name: 'Шоссе Коргалжын', x: 290, y: 480, icon: '🛣️' },
    ],
  },
  {
    name: 'Сарыарка',
    center: { x: 250, y: 175 },
    // North-West, Old Town, Right Bank, railway terminal
    path: 'M 195,75 C 265,55 330,70 375,100 C 400,120 405,155 385,185 C 365,215 320,240 280,255 C 235,270 180,260 145,225 C 115,190 125,135 155,95 Z',
    landmarks: [
      { name: 'Старый Ж/Д Вокзал', x: 235, y: 110, icon: '🚉' },
      { name: 'Набережная р. Есиль', x: 330, y: 215, icon: '🌊' },
      { name: 'Проспект Республики', x: 275, y: 165, icon: '🚦' },
    ],
  },
  {
    name: 'Байконур',
    center: { x: 440, y: 145 },
    // North Central, Industrial area, Alash highway, CHP-2
    path: 'M 375,100 C 430,70 515,65 570,95 C 605,115 600,150 565,180 C 530,210 470,225 420,230 C 390,215 385,170 380,135 Z',
    landmarks: [
      { name: 'ТЭЦ-2 / Промзона', x: 505, y: 120, icon: '🏭' },
      { name: 'Шоссе Алаш', x: 445, y: 95, icon: '🚚' },
      { name: 'Рынок Шанхай / Сапар', x: 420, y: 170, icon: '📦' },
    ],
  },
  {
    name: 'Алматы',
    center: { x: 620, y: 155 },
    // North-East, Palace of Peace, Hazrat Sultan Mosque, Nurly Zhol
    path: 'M 570,95 C 635,70 720,80 780,120 C 825,155 810,210 755,245 C 705,275 640,240 595,215 C 565,180 565,140 570,95 Z',
    landmarks: [
      { name: 'Мечеть Хазрет Султан', x: 645, y: 175, icon: '🕌' },
      { name: 'Вокзал Нурлы Жол', x: 740, y: 140, icon: '🚅' },
      { name: 'Дворец Мира и Согласия', x: 610, y: 210, icon: '🔺' },
    ],
  },
]

type MapLayer = 'all' | 'Транспорт' | 'Экология' | 'Соцсфера' | 'Безопасность' | 'Сервисы'

export default function Overview({ context, selectedCount, go, demo }: {
  context: CityContext; selectedCount: number; go: (page: Page) => void; demo: () => void
}) {
  const [active, setActive] = useState(context.baseline.weakest_district)
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all')

  // Interactive Zoom & Pan Controls
  const [zoom, setZoom] = useState(1.0)
  const [pan, setPan] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 })
  const [showLandmarks, setShowLandmarks] = useState(true)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const mapSvgRef = useRef<SVGSVGElement | null>(null)

  const district = context.districts.find(d => d.name === active) ?? context.districts[0]
  const critical = context.baseline.critical.filter(c => c.district === district.name)
  const weak = Object.entries(district.indicators).sort((a, b) => a[1] - b[1]).slice(0, 4)

  const getDistrictLayerValue = (distName: string): number => {
    const dist = context.districts.find(d => d.name === distName)
    if (!dist) return 50
    if (activeLayer === 'all') {
      return context.baseline.district_scores[distName] ?? 50
    }
    const domainDef = CITY_DOMAINS.find(d => d.id === activeLayer)
    if (!domainDef) return 50
    const vals = domainDef.indicators.map(ind => dist.indicators[ind] ?? 50)
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10
  }

  const getHeatmapColor = (score: number, isSelected: boolean) => {
    if (isSelected) return '#059669' // Selected emerald
    if (score < 45) return '#fca5a5' // Critical red
    if (score < 55) return '#fed7aa' // Warning amber
    if (score < 65) return '#bbf7d0' // Balanced light green
    return '#86efac' // Strong green
  }

  // Zoom handlers
  const handleZoomIn = () => setZoom(z => Math.min(2.5, Math.round((z + 0.25) * 100) / 100))
  const handleZoomOut = () => setZoom(z => Math.max(0.8, Math.round((z - 0.25) * 100) / 100))
  const handleResetView = () => {
    setZoom(1.0)
    setPan({ x: 0, y: 0 })
  }

  // Center on district
  const centerOnDistrict = (distName: string) => {
    setActive(distName)
    const target = DETAILED_DISTRICTS.find(d => d.name === distName)
    if (target) {
      setZoom(1.4)
      setPan({
        x: (450 - target.center.x) * 0.7,
        y: (300 - target.center.y) * 0.7,
      })
    }
  }

  // Pan dragging
  const handleMouseDown = (e: React.MouseEvent) => {
    setIsDragging(true)
    setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y })
  }

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return
    setPan({
      x: e.clientX - dragStart.x,
      y: e.clientY - dragStart.y,
    })
  }

  const handleMouseUp = () => setIsDragging(false)

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">СИТУАЦИОННЫЙ ЦЕНТР АСТАНЫ · ИСХОДНОЕ СОСТОЯНИЕ</div>
          <h1>Управление качеством жизни столицы</h1>
          <p>5 направлений развития, 5 районов города, фиксированный виртуальный бюджет 100 единиц.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={demo}>Загрузить эталонное демо <ArrowUpRight size={17} /></button>
          <button className="button primary" onClick={() => go('builder')}>Начать стратегию <ArrowRight size={17} /></button>
        </div>
      </div>

      <section className="hero">
        <div className="hero-copy">
          <div className="hero-tag"><span /> СИМУЛЯТОР «АКИМ НА 5 ЧАСОВ»</div>
          <h2>Пять выверенных решений.<br /><span>Сбалансированный город.</span></h2>
          <p>Распределите 100 единиц бюджета между транспортом, экологией, соцсферой, безопасностью и ЖКХ. Модель рассчитает единый <strong>Astana Quality of Life Score</strong> и вскроет скрытые риски.</p>
          <div className="hero-buttons">
            <button className="button lime" onClick={() => go('builder')}>Собрать свой план <ArrowRight size={18} /></button>
            <button className="button secondary" onClick={() => go('crisis')}>Стресс-тест форс-мажоров <Sparkles size={16} /></button>
          </div>
        </div>
        <div className="city-art" aria-hidden="true">
          <svg viewBox="0 0 500 280" fill="none">
            <defs>
              <linearGradient id="cityfade" x1="240" y1="40" x2="240" y2="280" gradientUnits="userSpaceOnUse">
                <stop stopColor="#10b981" stopOpacity=".8"/>
                <stop offset="1" stopColor="#064e3b" stopOpacity=".1"/>
              </linearGradient>
            </defs>
            <ellipse cx="260" cy="252" rx="229" ry="18" stroke="#10b981" strokeOpacity=".4"/>
            <path d="M25 252H478M41 261H445" stroke="#10b981" strokeOpacity=".3"/>
            <circle cx="299" cy="91" r="61" stroke="#34d399" strokeOpacity=".15"/>
            <circle cx="299" cy="91" r="81" stroke="#34d399" strokeOpacity=".08"/>
            <path d="M49 249V152L89 128L129 152V249M63 153V235M76 143V234M91 142V235M107 153V235M134 249V178H171V249M142 189H163M142 201H163M142 213H163M142 225H163M183 249V148L211 130L239 148V249M194 157V235M210 148V235M225 157V235M261 249L283 112M335 249L314 112M285 112H312M274 165H324M269 186H328M265 207H331M257 229H339M346 249V166H379V249M354 176H370M354 190H370M354 204H370M354 218H370M393 249V152H426V249M409 151V130M401 165H418M401 180H418M401 195H418M401 210H418M441 249V194H466V249" stroke="url(#cityfade)" strokeWidth="1.8"/>
            <circle cx="299" cy="91" r="25" fill="#10b981" fillOpacity=".2" stroke="#34d399" strokeWidth="1.5"/>
            <ellipse cx="299" cy="91" rx="13" ry="25" stroke="#34d399" strokeOpacity=".6"/>
          </svg>
          <div className="art-coordinate">ASTANA · SITUATION CENTER</div>
        </div>
        <div className="hero-corner">ASTANA<br /><span>URBAN STRATEGY</span></div>
      </section>

      <section className="stats-grid" aria-label="Исходные показатели">
        <Stat label="Базовый AQLS Score" value={format(context.baseline.score)} caption="Astana Quality of Life Score" icon={<Target size={19} />} tone="featured">
          <div className="mini-progress"><i style={{ width: `${context.baseline.score}%` }} /></div>
        </Stat>
        <Stat label="Лимит бюджета" value={<>{context.budget}<span>ед.</span></>} caption="Единый для всех команд" icon={<Wallet size={19} />} />
        <Stat label="Выбрано решений" value={<>{selectedCount}<span>/ {context.constraints.decision_count}</span></>} caption="Ровно 5 инициатив" icon={<Layers size={19} />} />
        <Stat label="Критические зоны" value={context.baseline.critical.length} caption={`Ниже порога ${context.constraints.critical_threshold} баллов`} icon={<CircleAlert size={19} />} tone="attention" />
      </section>

      <section className="domains-strip" aria-label="5 направлений городского развития">
        {CITY_DOMAINS.map(domain => {
          const indList = domain.indicators.map(code => `${code}: ${context.indicators[code]?.name}`).join(' · ')
          return (
            <div key={domain.id} className="domain-card">
              <div className="domain-header">
                <span className="domain-icon" style={{ color: domain.color }}>{directionIcon(domain.id, 18)}</span>
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
              <span className="eyebrow">ИНТЕРАКТИВНАЯ ВЫСОКОДЕТАЛИЗИРОВАННАЯ GIS-КАРТА АСТАНЫ</span>
              <h2>Картографическая модель 5 районов с зумом и гидрографией</h2>
            </div>

            <div className="gis-top-toolbar">
              <div className="map-layer-selector">
                <span className="small muted">Слой:</span>
                <select aria-label="Аналитический слой карты" value={activeLayer} onChange={e => setActiveLayer(e.target.value as MapLayer)}>
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
            {/* Interactive GIS Map Area with Zoom & Pan */}
            <div
              className={`map-wrap gis-viewport ${isDragging ? 'grabbing' : 'grab'}`}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
            >
              {/* Zoom & Navigation overlay controls */}
              <div className="gis-floating-controls no-print">
                <button className="gis-control-btn" onClick={handleZoomIn} title="Увеличить (Zoom In)">
                  <ZoomIn size={16} />
                </button>
                <span className="gis-zoom-indicator">{Math.round(zoom * 100)}%</span>
                <button className="gis-control-btn" onClick={handleZoomOut} title="Уменьшить (Zoom Out)">
                  <ZoomOut size={16} />
                </button>
                <button className="gis-control-btn" onClick={handleResetView} title="Сбросить зум и панораму">
                  <RotateCcw size={15} />
                </button>
              </div>

              <svg
                ref={mapSvgRef}
                viewBox="0 0 900 600"
                className="gis-svg"
                role="img"
                aria-label="Детальная карта районов Астаны"
              >
                <defs>
                  {/* Subtle technical background grid */}
                  <pattern id="gisgrid" width="30" height="30" patternUnits="userSpaceOnUse">
                    <path d="M 30 0 L 0 0 0 30" fill="none" stroke="#e2e8f0" strokeWidth="0.8" opacity="0.6" />
                  </pattern>
                  {/* River water gradient */}
                  <linearGradient id="ishimBlue" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.8" />
                    <stop offset="100%" stopColor="#0284c7" stopOpacity="0.9" />
                  </linearGradient>
                  {/* District shadows */}
                  <filter id="districtShadow" x="-5%" y="-5%" width="115%" height="115%">
                    <feDropShadow dx="0" dy="4" stdDeviation="6" floodOpacity="0.12" />
                  </filter>
                </defs>

                <rect width="900" height="600" fill="url(#gisgrid)" />

                {/* Transformable Canvas Group */}
                <g transform={`translate(${pan.x}, ${pan.y}) scale(${zoom})`} className="gis-canvas-group">
                  {/* Major Highway Corridors */}
                  <g className="gis-highways" opacity="0.4">
                    {/* Ring road & main avenues */}
                    <path d="M 120,480 C 250,560 650,550 780,440 C 850,380 830,160 760,100 C 660,40 280,30 160,110 C 90,170 80,380 120,480 Z" stroke="#94a3b8" strokeWidth="4" strokeDasharray="6 4" fill="none" />
                    {/* Mangilik El / Kabanbay Batyr Axis */}
                    <line x1="280" y1="260" x2="680" y2="460" stroke="#cbd5e1" strokeWidth="3" />
                    {/* Turan Avenue */}
                    <line x1="220" y1="290" x2="600" y2="490" stroke="#cbd5e1" strokeWidth="2.5" />
                    {/* Respublika Avenue */}
                    <line x1="260" y1="70" x2="380" y2="250" stroke="#cbd5e1" strokeWidth="3" />
                  </g>

                  {/* District Polygons */}
                  {DETAILED_DISTRICTS.map(d => {
                    const layerScore = getDistrictLayerValue(d.name)
                    const isSelected = active === d.name
                    const distData = context.districts.find(item => item.name === d.name)
                    const hasCrit = context.baseline.critical.some(c => c.district === d.name)

                    return (
                      <g
                        key={d.name}
                        className={`gis-district-group ${isSelected ? 'active' : ''}`}
                        onClick={() => centerOnDistrict(d.name)}
                        filter="url(#districtShadow)"
                      >
                        <path
                          d={d.path}
                          fill={getHeatmapColor(layerScore, isSelected)}
                          stroke={isSelected ? '#064e3b' : '#ffffff'}
                          strokeWidth={isSelected ? 4 : 2}
                          className="gis-district-polygon"
                        />

                        {/* District Center Badge & Text */}
                        <g transform={`translate(${d.center.x}, ${d.center.y})`}>
                          <rect
                            x="-52"
                            y="-24"
                            width="104"
                            height="48"
                            rx="8"
                            fill={isSelected ? '#064e3b' : 'rgba(255, 255, 255, 0.94)'}
                            stroke={isSelected ? '#10b981' : '#cbd5e1'}
                            strokeWidth="1.5"
                            className="gis-label-box"
                          />
                          <text
                            y="-6"
                            textAnchor="middle"
                            fill={isSelected ? '#ffffff' : '#0f172a'}
                            fontSize="13"
                            fontWeight="700"
                            className="gis-label-text"
                          >
                            {d.name}
                          </text>
                          <text
                            y="13"
                            textAnchor="middle"
                            fill={isSelected ? '#a7f3d0' : '#059669'}
                            fontSize="12"
                            fontWeight="600"
                          >
                            {format(layerScore, 1)} б.
                          </text>
                          {hasCrit && (
                            <circle cx="44" cy="-18" r="6" fill="#ef4444" stroke="#ffffff" strokeWidth="1.5" />
                          )}
                        </g>

                        {/* Population Tag */}
                        {distData && (
                          <text
                            x={d.center.x}
                            y={d.center.y + 36}
                            textAnchor="middle"
                            fill="#64748b"
                            fontSize="10"
                            fontWeight="500"
                          >
                            {Math.round(distData.population_share * 100)}% жителей
                          </text>
                        )}
                      </g>
                    )
                  })}

                  {/* Waterways: River Ishim and Lake Taldykol */}
                  <g className="gis-waterways" pointerEvents="none">
                    {/* Lake Taldykol in Nura district */}
                    <path
                      d="M 230,420 C 255,400 290,410 300,435 C 305,455 285,475 255,470 C 230,465 215,440 230,420 Z"
                      fill="#7dd3fc"
                      opacity="0.8"
                      stroke="#0284c7"
                      strokeWidth="1.5"
                    />
                    <text x="260" y="445" fontSize="9" fill="#0369a1" fontWeight="600" textAnchor="middle">
                      оз. Талдыколь
                    </text>

                    {/* River Ishim sweeping between Right and Left banks */}
                    <path
                      d="M 120,240 C 200,265 280,250 350,225 C 410,200 480,230 550,225 C 640,220 720,270 820,310"
                      stroke="url(#ishimBlue)"
                      strokeWidth="16"
                      strokeLinecap="round"
                      fill="none"
                    />
                    <text x="490" y="210" fontSize="10" fill="#0369a1" fontWeight="700" letterSpacing="2">
                      РЕКА ЕСИЛЬ (ИШИМ)
                    </text>

                    {/* Bridges */}
                    <line x1="330" y1="218" x2="330" y2="236" stroke="#475569" strokeWidth="4" />
                    <line x1="430" y1="208" x2="430" y2="226" stroke="#475569" strokeWidth="4" />
                    <line x1="570" y1="218" x2="570" y2="236" stroke="#475569" strokeWidth="4" />
                  </g>

                  {/* Landmarks and Attractions */}
                  {showLandmarks && (
                    <g className="gis-landmarks" pointerEvents="none">
                      {DETAILED_DISTRICTS.flatMap(d =>
                        d.landmarks.map(lm => (
                          <g key={lm.name} transform={`translate(${lm.x}, ${lm.y})`} className="landmark-pin">
                            <circle r="12" fill="#ffffff" stroke="#cbd5e1" strokeWidth="1" filter="url(#districtShadow)" />
                            <text y="4" textAnchor="middle" fontSize="11">{lm.icon}</text>
                            <text y="18" textAnchor="middle" fontSize="8.5" fill="#334155" fontWeight="600">
                              {lm.name}
                            </text>
                          </g>
                        ))
                      )}
                    </g>
                  )}
                </g>

                {/* Compass Rose */}
                <g transform="translate(840, 60)" className="gis-compass">
                  <circle r="20" fill="rgba(255,255,255,0.9)" stroke="#cbd5e1" strokeWidth="1" />
                  <path d="M 0,-14 L 5,0 L -5,0 Z" fill="#ef4444" />
                  <path d="M 0,14 L 5,0 L -5,0 Z" fill="#64748b" />
                  <text y="-5" textAnchor="middle" fontSize="9" fontWeight="800" fill="#ef4444">N</text>
                </g>

                {/* Scale & Caption */}
                <text x="30" y="575" fill="#64748b" fontSize="10" fontWeight="600" letterSpacing="0.05em">
                  ИНТЕРАКТИВНАЯ МОДЕЛЬ СТОЛИЦЫ · МАСШТАБ {zoom}x · СЛОЙ: {activeLayer.toUpperCase()}
                </text>
              </svg>

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

            {/* Quick District Selector List */}
            <div className="district-tabs" aria-label="Районы">
              <span className="small-label" style={{ marginBottom: 4 }}>РАЙОНЫ АСТАНЫ</span>
              {context.districts.map(d => {
                const score = getDistrictLayerValue(d.name)
                const hasCrit = context.baseline.critical.some(c => c.district === d.name)
                return (
                  <button
                    key={d.name}
                    className={`district-tab ${active === d.name ? 'active' : ''}`}
                    onClick={() => centerOnDistrict(d.name)}
                    aria-pressed={active === d.name}
                  >
                    <span>
                      <MapPin size={15} />
                      {d.name}
                      {hasCrit && <span className="crit-badge" title="Есть критический показатель">!</span>}
                    </span>
                    <strong>{format(score, 1)}</strong>
                  </button>
                )
              })}
              <p className="district-tip">
                Используйте колёсико мыши или кнопки [ + ] / [ − ] для детального масштабирования районов.
              </p>
            </div>
          </div>
        </div>

        {/* Selected District Deep Inspector */}
        <aside className="panel district-detail">
          <div className="flex-between">
            <div className="icon-tile green"><Building2 size={22} /></div>
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
                    <span>{context.indicators[id]?.name ?? id} <small className="muted">({id})</small></span>
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
        <div className="icon-tile"><Sparkles size={24} /></div>
        <div>
          <h3>Нужен советник при выборе стратегии?</h3>
          <p>AI Supervisor подбирает решения по заданному приоритету (максимальный скор, сбалансированность, спасение отстающего района).</p>
        </div>
        <button className="button secondary" onClick={() => go('advisor')}>Консультация с AI <ArrowUpRight size={17} /></button>
      </section>
    </div>
  )
}

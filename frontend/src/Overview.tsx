import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Building2, CircleAlert, Layers3, MapPin, Sparkles, Target, Wallet } from 'lucide-react'
import { format } from './api'
import { CITY_DOMAINS, directionIcon, Stat } from './components'
import type { CityContext, Page } from './types'

const districtShapes = [
  { path: 'M267 180 L408 133 L471 199 L432 287 L324 307 L261 251 Z', x: 371, y: 222 },
  { path: 'M283 61 L400 55 L448 114 L400 127 L265 171 L217 135 Z', x: 339, y: 111 },
  { path: 'M134 66 L228 44 L268 57 L204 135 L128 174 L80 131 Z', x: 168, y: 113 },
  { path: 'M128 184 L211 145 L256 182 L250 251 L190 278 L110 243 L77 203 Z', x: 172, y: 212 },
  { path: 'M90 254 L184 290 L258 264 L310 316 L272 367 L131 350 L71 307 Z', x: 194, y: 319 },
]

type MapLayer = 'all' | 'Транспорт' | 'Экология' | 'Соцсфера' | 'Безопасность' | 'Сервисы'

export default function Overview({ context, selectedCount, go, demo }: {
  context: CityContext; selectedCount: number; go: (page: Page) => void; demo: () => void
}) {
  const [active, setActive] = useState(context.baseline.weakest_district)
  const [activeLayer, setActiveLayer] = useState<MapLayer>('all')

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
    if (isSelected) return '#059669'
    if (score < 45) return '#fca5a5'
    if (score < 55) return '#fed7aa'
    if (score < 65) return '#bbf7d0'
    return '#86efac'
  }

  return <div className="page-enter">
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
      <Stat label="Выбрано решений" value={<>{selectedCount}<span>/ {context.constraints.decision_count}</span></>} caption="Ровно 5 инициатив" icon={<Layers3 size={19} />} />
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
      <div className="panel city-panel">
        <div className="panel-title">
          <div>
            <span className="eyebrow">ИНТЕРАКТИВНАЯ GIS-КАРТА АСТАНЫ</span>
            <h2>Районы столицы и тепловые слои</h2>
          </div>
          <div className="map-layer-selector">
            <span className="small muted">Слой:</span>
            <select aria-label="Аналитический слой карты" value={activeLayer} onChange={e => setActiveLayer(e.target.value as MapLayer)}>
              <option value="all">Общий рейтинг районов</option>
              <option value="Транспорт">Транспорт (T1, T2)</option>
              <option value="Экология">Экология и смог (E1, E2)</option>
              <option value="Соцсфера">Соцсфера и школы (S1, S2)</option>
              <option value="Безопасность">Безопасность (B1, B2)</option>
              <option value="Сервисы">ЖКХ и сервисы (C1, C2)</option>
            </select>
          </div>
        </div>

        <div className="city-panel-body">
          <div className="map-wrap">
            <svg viewBox="0 0 535 410" role="img" aria-label="Схема районов Астаны">
              <defs>
                <pattern id="mapdots" width="18" height="18" patternUnits="userSpaceOnUse">
                  <circle cx="1" cy="1" r="1" fill="#cbd5e1" />
                </pattern>
              </defs>
              <rect width="535" height="410" fill="url(#mapdots)" />
              <path d="M8 345 C125 215 236 372 332 209 S491 143 545 33" stroke="#38bdf8" strokeWidth="12" strokeLinecap="round" fill="none" opacity={0.6} />
              
              {context.districts.map((d, i) => {
                const layerScore = getDistrictLayerValue(d.name)
                const isSelected = active === d.name
                const shape = districtShapes[i]
                return (
                  <g key={d.name} className={`map-district ${isSelected ? 'active' : ''}`} onClick={() => setActive(d.name)}>
                    <path
                      d={shape?.path}
                      fill={getHeatmapColor(layerScore, isSelected)}
                      stroke={isSelected ? '#064e3b' : '#ffffff'}
                      strokeWidth={isSelected ? 4 : 2}
                    />
                    <text x={shape?.x} y={shape?.y} textAnchor="middle" className="district-title">{d.name}</text>
                    <text className="map-score" x={shape?.x} y={(shape?.y ?? 0) + 21} textAnchor="middle">
                      {format(layerScore, 1)}
                    </text>
                  </g>
                )
              })}
              <text x="464" y="342" className="map-north">N</text>
              <path d="M469 349V372M464 355L469 349L474 355" stroke="#64748b" />
              <text x="28" y="390" className="map-caption">КАРТА-СХЕМА АСТАНЫ · ТЕПЛОВОЙ СЛОЙ: {activeLayer.toUpperCase()}</text>
            </svg>
            <div className="map-key">
              <div className="heat-legend">
                <span>Низкий (&lt;45)</span>
                <div className="heat-bar" />
                <span>Высокий (&gt;65)</span>
              </div>
              <span className="key-active"><i className="green-dot" /> Выбранный район: <strong>{active}</strong></span>
            </div>
          </div>

          <div className="district-tabs" aria-label="Районы">
            {context.districts.map(d => {
              const score = getDistrictLayerValue(d.name)
              const hasCrit = context.baseline.critical.some(c => c.district === d.name)
              return (
                <button
                  key={d.name}
                  className={`district-tab ${active === d.name ? 'active' : ''}`}
                  onClick={() => setActive(d.name)}
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
            <p className="district-tip">Кликните на район,<br />чтобы изучить профиль и точки роста.</p>
          </div>
        </div>
      </div>

      <aside className="panel district-detail">
        <div className="flex-between">
          <div className="icon-tile green"><Building2 size={22} /></div>
          <span className={`badge ${critical.length ? 'warning' : 'success'}`}>
            {critical.length ? `Критических зон: ${critical.length}` : 'В норме'}
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
}

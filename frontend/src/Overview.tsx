import { useState } from 'react'
import { ArrowRight, ArrowUpRight, Building2, CircleAlert, Layers3, MapPin, Sparkles, Target, Wallet } from 'lucide-react'
import { format } from './api'
import { PanelTitle, Stat } from './components'
import type { CityContext, Page } from './types'

const districtShapes = [
  { path: 'M267 180 L408 133 L471 199 L432 287 L324 307 L261 251 Z', x: 371, y: 222 },
  { path: 'M283 61 L400 55 L448 114 L400 127 L265 171 L217 135 Z', x: 339, y: 111 },
  { path: 'M134 66 L228 44 L268 57 L204 135 L128 174 L80 131 Z', x: 168, y: 113 },
  { path: 'M128 184 L211 145 L256 182 L250 251 L190 278 L110 243 L77 203 Z', x: 172, y: 212 },
  { path: 'M90 254 L184 290 L258 264 L310 316 L272 367 L131 350 L71 307 Z', x: 194, y: 319 },
]

export default function Overview({ context, selectedCount, go, demo }: {
  context: CityContext; selectedCount: number; go: (page: Page) => void; demo: () => void
}) {
  const [active, setActive] = useState(context.baseline.weakest_district)
  const district = context.districts.find(d => d.name === active) ?? context.districts[0]
  const critical = context.baseline.critical.filter(c => c.district === district.name)
  const weak = Object.entries(district.indicators).sort((a, b) => a[1] - b[1]).slice(0, 3)
  return <div className="page-enter">
    <div className="page-heading"><div><div className="eyebrow">Город начинается с решений</div><h1>Астана. Следующая глава.</h1><p>Пять решений, которые изменят качество жизни города.</p></div><button className="button secondary" onClick={demo}>Загрузить демо <ArrowUpRight size={17} /></button></div>
    <section className="hero">
      <div className="hero-copy"><div className="hero-tag"><span /> ВАШ ГОРОД. ВАША СТРАТЕГИЯ.</div><h2>Большие перемены.<br /><span>Взвешенные решения.</span></h2><p>Распределите бюджет, поддержите районы<br className="desktop-only" /> и узнайте, как ваш план повлияет на город.</p><button className="button lime" onClick={() => go('builder')}>Создать стратегию <ArrowRight size={18} /></button></div>
      <div className="city-art" aria-hidden="true"><svg viewBox="0 0 500 280" fill="none"><defs><linearGradient id="cityfade" x1="240" y1="40" x2="240" y2="280" gradientUnits="userSpaceOnUse"><stop stopColor="#b6d8b4" stopOpacity=".7"/><stop offset="1" stopColor="#b6d8b4" stopOpacity=".08"/></linearGradient></defs><ellipse cx="260" cy="252" rx="229" ry="18" stroke="#77a695" strokeOpacity=".3"/><path d="M25 252H478M41 261H445" stroke="#77a695" strokeOpacity=".4"/><circle cx="299" cy="91" r="61" stroke="#8fb7a5" strokeOpacity=".13"/><circle cx="299" cy="91" r="81" stroke="#8fb7a5" strokeOpacity=".08"/><path d="M49 249V152L89 128L129 152V249M63 153V235M76 143V234M91 142V235M107 153V235M134 249V178H171V249M142 189H163M142 201H163M142 213H163M142 225H163M183 249V148L211 130L239 148V249M194 157V235M210 148V235M225 157V235M261 249L283 112M335 249L314 112M285 112H312M274 165H324M269 186H328M265 207H331M257 229H339M346 249V166H379V249M354 176H370M354 190H370M354 204H370M354 218H370M393 249V152H426V249M409 151V130M401 165H418M401 180H418M401 195H418M401 210H418M441 249V194H466V249" stroke="url(#cityfade)" strokeWidth="1.7"/><circle cx="299" cy="91" r="25" fill="#d1e6ac" fillOpacity=".15" stroke="#d1e6ac" strokeWidth="1.5"/><ellipse cx="299" cy="91" rx="13" ry="25" stroke="#d1e6ac" strokeOpacity=".6"/><path d="M274 91H324M277 79H321M277 103H321" stroke="#d1e6ac" strokeOpacity=".6"/><path d="M280 230L298 139L317 230" stroke="#b7d7b6" strokeOpacity=".5"/><circle cx="126" cy="81" r="3" fill="#d1e6ac"/><path d="M425 78V91M419 84H431M176 47V57M171 52H181" stroke="#d1e6ac" strokeOpacity=".5"/></svg><div className="art-coordinate">51°10′ N · 71°26′ E</div></div>
      <div className="hero-corner">ASTANA<br /><span>URBAN LAB</span></div>
    </section>
    <section className="stats-grid" aria-label="Исходные показатели">
      <Stat label="Качество жизни" value={format(context.baseline.score)} caption="Astana Quality of Life Score" icon={<Target size={19} />} tone="featured"><div className="mini-progress"><i style={{ width: `${context.baseline.score}%` }} /></div></Stat>
      <Stat label="Доступный бюджет" value={<>{context.budget}<span>ед.</span></>} caption="Ресурс для вашей стратегии" icon={<Wallet size={19} />} />
      <Stat label="Ваши решения" value={<>{selectedCount}<span>/ {context.constraints.decision_count}</span></>} caption="От идеи к действию" icon={<Layers3 size={19} />} />
      <Stat label="Требуют внимания" value={context.baseline.critical.length} caption="Показатели ниже критического порога" icon={<CircleAlert size={19} />} tone="attention" />
    </section>
    <section className="overview-grid">
      <div className="panel city-panel"><PanelTitle eyebrow="ТОЧКА ОТСЧЁТА" title="У каждого района своя история" right={<span className="badge">{context.districts.length} районов</span>} /><div className="city-panel-body"><div className="map-wrap"><svg viewBox="0 0 535 410" role="img" aria-label="Схема районов Астаны. Выберите район в списке справа."><defs><pattern id="mapdots" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1" cy="1" r="1" fill="#d9e0d6" /></pattern></defs><rect width="535" height="410" fill="url(#mapdots)" /><path d="M8 345 C125 215 236 372 332 209 S491 143 545 33" stroke="#bcdbe0" strokeWidth="11" strokeLinecap="round" fill="none" />{context.districts.map((d, i) => <g key={d.name} className={`map-district ${active === d.name ? 'active' : ''}`} onClick={() => setActive(d.name)}><path d={districtShapes[i]?.path} /><text x={districtShapes[i]?.x} y={districtShapes[i]?.y} textAnchor="middle">{d.name}</text><text className="map-score" x={districtShapes[i]?.x} y={(districtShapes[i]?.y ?? 0) + 21} textAnchor="middle">{format(context.baseline.district_scores[d.name], 1)}</text></g>)}<text x="464" y="342" className="map-north">N</text><path d="M469 349V372M464 355L469 349L474 355" stroke="#879a90" /><text x="28" y="390" className="map-caption">СХЕМАТИЧЕСКОЕ РАСПОЛОЖЕНИЕ</text></svg><div className="map-key"><span><i className="green-dot" /> Выбранный район</span><span>Больше балл — лучше</span></div></div><div className="district-tabs" aria-label="Районы">{context.districts.map(d => <button key={d.name} className={`district-tab ${active === d.name ? 'active' : ''}`} onClick={() => setActive(d.name)} aria-pressed={active === d.name}><span><MapPin size={16} />{d.name}</span><strong>{format(context.baseline.district_scores[d.name], 1)}</strong></button>)}<p className="district-tip">Выберите район,<br />чтобы увидеть детали.</p></div></div></div>
      <aside className="panel district-detail"><div className="flex-between"><div className="icon-tile green"><Building2 size={22} /></div><span className={`badge ${critical.length ? 'warning' : ''}`}>{critical.length ? 'Требует внимания' : 'Профиль района'}</span></div><h2>{district.name}</h2><p className="district-profile">{district.profile}</p><div className="district-number"><strong>{format(context.baseline.district_scores[district.name])}</strong><span>оценка района</span></div><div className="detail-divider" /><div className="small-label">ТОЧКИ РОСТА</div><div className="indicator-list">{weak.map(([id, value]) => <div key={id}><div className="flex-between"><span>{context.indicators[id]?.name ?? id}</span><strong className={critical.some(c => c.indicator === id) ? 'text-amber' : ''}>{format(value, 0)}</strong></div><div className={`indicator-track ${critical.some(c => c.indicator === id) ? 'warning' : ''}`}><i style={{ width: `${value}%` }} /></div></div>)}</div><button className="text-button" onClick={() => go('builder')}>Перейти к решениям <ArrowRight size={16} /></button></aside>
    </section>
    <section className="advisor-strip"><div className="icon-tile"><Sparkles size={24} /></div><div><h3>Хорошей стратегии нужен второй взгляд</h3><p>Задайте цель советнику или найдите сценарии по выбранному приоритету.</p></div><button className="button secondary" onClick={() => go('advisor')}>Открыть AI-советника <ArrowUpRight size={17} /></button></section>
  </div>
}

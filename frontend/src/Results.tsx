import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  CircleAlert,
  Flame,
  GitCompareArrows,
  MapPin,
  Presentation,
  RefreshCw,
  Sparkles,
  Target,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { errorText, format, request, signed } from './api'
import { calculateDomainScores, Delta, Empty, ErrorNotice, Loading, PanelTitle, Stat } from './components'
import type { Analysis, CityContext, Comparison, Page, Simulation } from './types'

export default function Results({
  context,
  result,
  previous,
  edit,
  advisor,
  analysis,
  analyzing,
  analyze,
  go,
}: {
  context: CityContext
  result: Simulation | null
  previous: Simulation | null
  edit: () => void
  advisor: () => void
  analysis: Analysis | null
  analyzing: boolean
  analyze: () => void
  go?: (page: Page) => void
}) {
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [compareError, setCompareError] = useState<string | null>(null)
  const [comparing, setComparing] = useState(false)
  const [districtFilter, setDistrictFilter] = useState('Все районы')

  if (!result) {
    return (
      <Empty
        title="Здесь появится результат вашей стратегии"
        action={
          <button className="button primary" onClick={edit}>
            Собрать 5 решений в конструкторе <ArrowRight size={17} />
          </button>
        }
      >
        Выберите пять городских мероприятий и запустите расчёт. Детерминированный симулятор города посчитает итоговый Astana Quality of Life Score.
      </Empty>
    )
  }

  // Data for district comparison bar chart
  const districtChartData = Object.entries(result.districts).map(([name, d]) => ({
    name,
    'До': d.score.before,
    'После': d.score.after,
  }))

  // Data for 5-axis Radar chart
  const domainData = calculateDomainScores(context, result).map(item => ({
    subject: item.domain,
    'Базовый': item.before,
    'После мер': item.after,
    fullMark: 100,
  }))

  const changes = result.indicator_changes.filter(
    c => c.delta !== 0 && (districtFilter === 'Все районы' || c.district === districtFilter)
  )

  async function compare() {
    setComparing(true)
    setCompareError(null)
    try {
      setComparison(
        await request<Comparison>('/compare', {
          scenario_a: previous!.decisions,
          scenario_b: result!.decisions,
        })
      )
    } catch (e) {
      setCompareError(errorText(e))
    } finally {
      setComparing(false)
    }
  }

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">СИТУАЦИОННЫЙ ЦЕНТР · РЕЗУЛЬТАТ СТРАТЕГИИ НА {context.horizon} КВАРТАЛОВ</div>
          <h1>Оценка качества жизни Астаны</h1>
          <p>Детерминированный расчёт формулы AQLS и глубокий AI-анализ компромиссов.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={edit}>
            <ArrowLeft size={16} /> Изменить решения
          </button>
          {go && (
            <>
              <button className="button secondary" onClick={() => go('crisis')}>
                <Flame size={16} /> Проверить кризисом
              </button>
              <button className="button primary" onClick={() => go('pitch')}>
                <Presentation size={16} /> Доклад Акиму
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Score Banner */}
      <section className="result-banner">
        <div>
          <div className="hero-tag">
            <span /> ASTANA QUALITY OF LIFE SCORE (AQLS)
          </div>
          <div className="result-score">
            <span>{format(result.score.before)}</span>
            <ArrowRight size={32} />
            <strong data-testid="result-score">{format(result.score.after)}</strong>
            <Delta value={result.score.delta} />
          </div>
          <p className="score-explainer">
            Индекс учитывает средний балл столицы, показатель отстающего района (<strong>{result.weakest_district.after}</strong>) и штрафы за критические показатели ниже {context.constraints.critical_threshold} баллов.
          </p>
        </div>
        <div className="result-seal">
          <Target size={38} strokeWidth={1.2} />
          <span>СТРАТЕГИЯ ПРОВЕРЕНА</span>
          <strong>{result.decisions.length} решений</strong>
          <small>{result.critical.after === 0 ? 'Все критические зоны устранены!' : `Осталось критических: ${result.critical.after}`}</small>
        </div>
      </section>

      {/* Stats Cards */}
      <section className="stats-grid result-stats">
        <Stat
          label="Использовано бюджета"
          value={<>{result.budget.used}<span>/ {result.budget.total}</span></>}
          caption={`Остаток: ${result.budget.remaining} ед.`}
          icon={<Wallet size={19} />}
        />
        <Stat
          label="Критические показатели"
          value={
            <>
              <span className="before-value">{result.critical.before}</span>
              <ArrowRight size={20} />
              <span className={result.critical.after === 0 ? 'text-green' : 'text-amber'}>{result.critical.after}</span>
            </>
          }
          caption={result.critical.after === 0 ? 'Успех: 0 показателей ниже 40 баллов' : 'Требуют внимания в следующем цикле'}
          icon={<CircleAlert size={19} />}
          tone={result.critical.after ? 'attention' : 'featured'}
        />
        <Stat
          label="Самый слабый район"
          value={<span className="name-value">{result.weakest_district.after}</span>}
          caption={`Оценка района: ${format(result.after.minimum, 1)}`}
          icon={<MapPin size={19} />}
        />
        <Stat
          label="Активные синергии"
          value={<span className="synergy-val">{result.synergies.length}</span>}
          caption="Дополнительные эффекты от связок мер"
          icon={<Zap size={19} />}
          tone="featured"
        />
      </section>

      {/* Visual Analytics Grid: Radar Chart + District Bars */}
      <div className="results-grid analytics-double">
        {/* 5-Axis Radar Chart */}
        <section className="panel chart-panel">
          <PanelTitle
            eyebrow="5 НАПРАВЛЕНИЙ РАЗВИТИЯ"
            title="Радарный баланс города (Radar Chart)"
          />
          <p className="small muted" style={{ marginTop: -14, marginBottom: 12 }}>
            Сравнение средних показателей города по 5 обязательным направлениям ТЗ:
          </p>
          <div className="radar-container" role="img" aria-label="Радарная диаграмма баланса 5 направлений города">
            <ResponsiveContainer width="100%" height={290}>
              <RadarChart cx="50%" cy="50%" outerRadius="75%" data={domainData}>
                <PolarGrid stroke="#e2e8f0" />
                <PolarAngleAxis dataKey="subject" tick={{ fill: '#334155', fontSize: 12, fontWeight: 500 }} />
                <PolarRadiusAxis domain={[0, 100]} angle={30} tick={{ fill: '#94a3b8', fontSize: 10 }} />
                <Radar
                  name="Базовый уровень"
                  dataKey="Базовый"
                  stroke="#94a3b8"
                  fill="#94a3b8"
                  fillOpacity={0.25}
                />
                <Radar
                  name="После вашей стратегии"
                  dataKey="После мер"
                  stroke="#059669"
                  fill="#10b981"
                  fillOpacity={0.45}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Tooltip
                  contentStyle={{ background: '#ffffff', border: '1px solid #cbd5e1', borderRadius: 8, fontSize: 12 }}
                  formatter={(val: unknown) => `${format(Number(val), 1)} баллов`}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </section>

        {/* District Comparison Bar Chart */}
        <section className="panel chart-panel">
          <PanelTitle
            eyebrow="ДЕТАЛИЗАЦИЯ ПО РАЙОНАМ"
            title="Оценки районов: До и После"
          />
          <div className="chart-container" role="img" aria-label="Сравнение оценок районов">
            <ResponsiveContainer width="100%" height={270}>
              <BarChart data={districtChartData} margin={{ top: 14, right: 10, bottom: 0, left: -20 }} barGap={6}>
                <CartesianGrid strokeDasharray="3 6" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#475569', fontSize: 12 }} />
                <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: '#f8fafc' }}
                  contentStyle={{ border: '1px solid #e2e8f0', borderRadius: 8, fontSize: 12 }}
                  formatter={value => format(Number(value), 1)}
                />
                <Legend iconType="circle" wrapperStyle={{ fontSize: 12, paddingTop: 10 }} />
                <Bar isAnimationActive={false} dataKey="До" fill="#cbd5e1" radius={[4, 4, 0, 0]} maxBarSize={32} />
                <Bar isAnimationActive={false} dataKey="После" fill="#059669" radius={[4, 4, 0, 0]} maxBarSize={32} />
              </BarChart>
            </ResponsiveContainer>
          </div>
          <div className="district-deltas">
            {Object.entries(result.districts).map(([name, data]) => (
              <div key={name}>
                <span>{name}</span>
                <Delta value={data.score.delta} />
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* AI Supervisor Section */}
      <section className="panel ai-panel">
        <PanelTitle
          eyebrow="ИНТЕЛЛЕКТУАЛЬНЫЙ АНАЛИЗ"
          title="Вердикт AI Supervisor: сильные стороны, риски и компромиссы"
          right={<Sparkles size={22} className="text-emerald" />}
        />
        {analyzing ? (
          <Loading>AI Supervisor анализирует последствия принятых решений…</Loading>
        ) : analysis?.available ? (
          <div className="analysis-text">{analysis.explanation}</div>
        ) : (
          <div className="ai-unavailable">
            <div className="icon-tile green"><Sparkles size={24} /></div>
            <div>
              <h3>AI-объяснение готово к генерации</h3>
              <p>{analysis?.message ?? 'Запросите разбор эффектов, компромиссов и потенциальных рисков текущего портфеля мер.'}</p>
              <button className="button secondary" onClick={analyze}>
                <RefreshCw size={15} /> {analysis ? 'Повторить запрос к модели' : 'Сформировать экспертное заключение'}
              </button>
            </div>
          </div>
        )}
        <div className="ai-actions-bar">
          <button className="button secondary" onClick={advisor}>
            Задать вопрос советнику в чате <ArrowUpRight size={16} />
          </button>
        </div>
      </section>

      {/* Indicator Changes Table */}
      <section className="panel">
        <PanelTitle
          eyebrow="ДЕТАЛЬНАЯ ВЕРИФИКАЦИЯ"
          title="Сдвиг ключевых показателей города"
          right={
            <label className="select-field has-district compact-select">
              <MapPin size={13} />
              <select
                id="results-district-filter"
                name="districtFilter"
                aria-label="Фильтр по району"
                value={districtFilter}
                onChange={e => setDistrictFilter(e.target.value)}
              >
                <option>Все районы</option>
                {context.districts.map(d => (
                  <option key={d.name}>{d.name}</option>
                ))}
              </select>
              <ChevronDown size={13} />
            </label>
          }
        />

        <div className="results-filter-strip" aria-label="Быстрый фильтр по районам">
          <button
            type="button"
            className={`district-filter-pill ${districtFilter === 'Все районы' ? 'active' : ''}`}
            onClick={() => setDistrictFilter('Все районы')}
          >
            Все районы ({result.indicator_changes.filter(c => c.delta !== 0).length})
          </button>
          {context.districts.map(d => {
            const count = result.indicator_changes.filter(c => c.district === d.name && c.delta !== 0).length
            return (
              <button
                key={d.name}
                type="button"
                className={`district-filter-pill ${districtFilter === d.name ? 'active' : ''}`}
                onClick={() => setDistrictFilter(d.name)}
              >
                <MapPin size={12} />
                <span>{d.name}</span>
                {count > 0 && <span className="filter-count">{count}</span>}
              </button>
            )
          })}
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Район</th>
                <th>Показатель</th>
                <th>Направление</th>
                <th>До</th>
                <th>После</th>
                <th>Изменение</th>
              </tr>
            </thead>
            <tbody>
              {changes.map(change => (
                <tr key={`${change.district}-${change.indicator}`}>
                  <td><strong>{change.district}</strong></td>
                  <td>
                    <span className="table-code">{change.indicator}</span>
                    {context.indicators[change.indicator]?.name}
                  </td>
                  <td><span className="muted">{context.indicators[change.indicator]?.direction}</span></td>
                  <td className="muted">{format(change.before)}</td>
                  <td><strong>{format(change.after)}</strong></td>
                  <td><Delta value={change.delta} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          {changes.length === 0 && <p className="empty-table">В выбранном фильтре изменений нет.</p>}
        </div>
      </section>

      {/* Synergies & Contributions */}
      <div className="results-grid lower-results">
        <section className="panel">
          <PanelTitle eyebrow="ПРОЗРАЧНОСТЬ РАСЧЁТА" title="Вклад каждого выбранного мероприятия" />
          <div className="contributions">
            {result.measure_contributions.map(measure => (
              <details key={measure.measure_id}>
                <summary>
                  <span className="table-code">{measure.measure_id}</span>
                  <div>
                    <strong>{measure.name}</strong>
                    <small>
                      {measure.district ?? 'Все районы'} · {measure.cost} ед. бюджета · учтено {format(measure.effect_share * 100, 0)}% эффекта (лаг {measure.lag} кв.)
                    </small>
                  </div>
                  <span className="expand-mark">+</span>
                </summary>
                <div className="contribution-effects">
                  {Object.entries(measure.effects_by_district).map(([name, effects]) => (
                    <div key={name}>
                      <span>{name}:</span>
                      <div className="effect-chips">
                        {Object.entries(effects).map(([indicator, value]) => (
                          <span key={indicator} className={value < 0 ? 'negative-effect' : ''}>
                            {indicator} {signed(value)}
                          </span>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>

        <section className="panel">
          <PanelTitle eyebrow="СИНЕРГИИ И ОГРАНИЧЕНИЯ" title="Сработавшие сочетания мер" />
          <div className="result-notes">
            {result.synergies.map((synergy, index) => (
              <div className="result-note synergy-note" key={index}>
                <Zap size={18} className="text-emerald" />
                <div>
                  <strong>{synergy.measures.join(' + ')} · {synergy.district}</strong>
                  <p>
                    {Object.entries(synergy.effects)
                      .map(([id, value]) => `${id} ${signed(value)}`)
                      .join(', ')} — получен дополнительный мультипликативный эффект!
                  </p>
                </div>
              </div>
            ))}

            {result.synergies.length === 0 && (
              <p className="muted small">В текущей комбинации нет активированных синергий.</p>
            )}

            {result.critical.remaining.map(c => (
              <div className="result-note warning-note" key={`${c.district}-${c.indicator}`}>
                <CircleAlert size={18} />
                <div>
                  <strong>{c.district} · {c.indicator} ({context.indicators[c.indicator]?.name})</strong>
                  <p>Значение {format(c.value)} всё ещё ниже критического порога {context.constraints.critical_threshold}.</p>
                </div>
              </div>
            ))}

            {result.critical.after === 0 && (
              <div className="result-note success-note">
                <Check size={18} />
                <div>
                  <strong>Критических точек не осталось</strong>
                  <p>Все индикаторы во всех 5 районах превышают порог {context.constraints.critical_threshold} баллов.</p>
                </div>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Comparison with previous plan */}
      <section className="panel comparison-panel">
        <PanelTitle
          eyebrow="БЕНЧМАРКИНГ СЦЕНАРИЕВ"
          title="Сравнение с предыдущей версией вашего плана"
          right={<GitCompareArrows size={21} />}
        />
        {previous ? (
          <>
            <p className="muted small">
              План A — предыдущий запуск. План B — текущий портфель решений.
            </p>
            <button className="button secondary" onClick={compare} disabled={comparing}>
              {comparing ? 'Сравниваем…' : 'Сравнить оба плана'}{' '}
              <GitCompareArrows size={16} />
            </button>
            {compareError && <ErrorNotice message={compareError} retry={compare} />}
            {comparison?.valid && (
              <div className="comparison-results">
                <div className="comparison-summary">
                  <div>
                    <span>Score A → B</span>
                    <strong>{format(comparison.score.a)} → {format(comparison.score.b)}</strong>
                    <Delta value={comparison.score.delta} />
                  </div>
                  <div>
                    <span>Бюджет A → B</span>
                    <strong>{comparison.budget.a} → {comparison.budget.b} ед.</strong>
                  </div>
                  <div>
                    <span>Критические зоны</span>
                    <strong>{comparison.critical.count_a} → {comparison.critical.count_b}</strong>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="muted">
            Измените решения в конструкторе и рассчитайте повторно — система автоматически включит режим сравнения версий.
          </p>
        )}
      </section>
    </div>
  )
}

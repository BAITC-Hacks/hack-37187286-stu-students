import { useState } from 'react'
import {
  ArrowRight,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Code,
  Copy,
  Globe2,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Upload,
  Wallet,
  Zap,
} from 'lucide-react'
import { CITY_DOMAINS, directionClass, directionIcon, ErrorNotice, Loading, PanelTitle } from './components'
import { signed } from './api'
import type { CityContext, Decision, Validation } from './types'

export const CONTROL_PLAN: Decision[] = [
  { measure_id: 'M7', district: 'Нура' },
  { measure_id: 'M8', district: 'Нура' },
  { measure_id: 'M10', district: 'Нура' },
  { measure_id: 'M12', district: null },
  { measure_id: 'M5', district: 'Сарыарка' },
]

export default function Builder({ context, decisions, setDecisions, validation, validating, validationError, retry, simulate, simulating, demo }: {
  context: CityContext; decisions: Decision[]; setDecisions: (decisions: Decision[]) => void
  validation: Validation | null; validating: boolean; validationError: string | null; retry: () => void
  simulate: () => void; simulating: boolean; demo: () => void
}) {
  const [filter, setFilter] = useState('Все направления')
  const [searchQuery, setSearchQuery] = useState('')
  const [showJsonModal, setShowJsonModal] = useState(false)
  const [jsonInput, setJsonInput] = useState(JSON.stringify({ decisions: CONTROL_PLAN }, null, 2))
  const [jsonError, setJsonError] = useState<string | null>(null)
  const [copySuccess, setCopySuccess] = useState(false)

  const directions = [...new Set(context.measures.map(m => m.direction))]

  // Synergy detection helpers
  const selectedIds = new Set(decisions.map(d => d.measure_id))

  const getSynergyStatus = (id: string) => {
    const synergyPairs: Record<string, string> = {
      'M1': 'M2', 'M2': 'M1',
      'M10': 'M12', 'M12': 'M10',
      'M5': 'M6', 'M6': 'M5',
    }
    const partner = synergyPairs[id]
    if (!partner) return null
    if (selectedIds.has(id) && selectedIds.has(partner)) {
      return { active: true, partner, text: `Синергия с ${partner} активирована!` }
    }
    if (selectedIds.has(partner)) {
      return { ready: true, partner, text: `Даст синергию в паре с ${partner}` }
    }
    return null
  }

  // Count per direction
  const directionCounts: Record<string, number> = {}
  for (const d of decisions) {
    const m = context.measures.find(measure => measure.id === d.measure_id)
    if (m) directionCounts[m.direction] = (directionCounts[m.direction] || 0) + 1
  }

  // Filter & Search measures
  const measures = context.measures.filter(m => {
    const matchesDirection = filter === 'Все направления' || m.direction === filter
    const matchesSearch = !searchQuery.trim() ||
      m.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      m.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      Object.keys(m.effects).some(k => k.toLowerCase().includes(searchQuery.toLowerCase()))
    return matchesDirection && matchesSearch
  })

  const toggle = (id: string) => {
    setDecisions(decisions.some(d => d.measure_id === id)
      ? decisions.filter(d => d.measure_id !== id)
      : [...decisions, { measure_id: id, district: null }])
  }

  // Presets
  const loadControlPlan = () => {
    setDecisions(CONTROL_PLAN.map(d => ({ ...d })))
  }

  const setBalancedPreset = () => {
    // 1 measure per each of the 5 directions
    setDecisions([
      { measure_id: 'M2', district: null }, // Транспорт
      { measure_id: 'M6', district: null }, // Экология
      { measure_id: 'M7', district: 'Нура' }, // Соцсфера
      { measure_id: 'M10', district: 'Нура' }, // Безопасность
      { measure_id: 'M12', district: null }, // Сервисы
    ])
  }

  const applyJson = () => {
    setJsonError(null)
    try {
      const parsed = JSON.parse(jsonInput)
      const list = Array.isArray(parsed) ? parsed : parsed.decisions
      if (!Array.isArray(list)) {
        throw new Error('Ожидался JSON объект вида { "decisions": [...] } или массив решений')
      }
      const normalized: Decision[] = list.map((item: { measure_id?: string; district?: string | null }) => {
        if (!item.measure_id) throw new Error('Каждый элемент должен содержать "measure_id"')
        return {
          measure_id: String(item.measure_id),
          district: item.district ?? null,
        }
      })
      setDecisions(normalized)
      setShowJsonModal(false)
    } catch (e) {
      setJsonError(e instanceof Error ? e.message : 'Неверный JSON формат')
    }
  }

  const copyCurrentJson = () => {
    navigator.clipboard.writeText(JSON.stringify({ decisions }, null, 2))
    setCopySuccess(true)
    setTimeout(() => setCopySuccess(false), 2000)
  }

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">СТРАТЕГИЧЕСКИЙ ПЛАНИРОВЩИК</div>
          <h1>Конструктор городских решений</h1>
          <p>Выберите ровно {context.constraints.decision_count} мероприятий в рамках бюджета {context.budget} ед. (не более {context.constraints.max_per_direction} на одно направление).</p>
        </div>
        <div className="heading-actions">
          <button className="button primary" onClick={loadControlPlan} title="Контрольный план ТЗ: Нура M7, M8, M10 + M12 + M5 Сарыарка">
            <Check size={16} /> Контрольный план ТЗ (95 ед.)
          </button>
          <button className="button secondary" onClick={() => { setJsonInput(JSON.stringify({ decisions: decisions.length ? decisions : CONTROL_PLAN }, null, 2)); setShowJsonModal(true) }}>
            <Code size={16} /> JSON Контракт
          </button>
          <button className="button secondary" onClick={setBalancedPreset} title="Сбалансировать по 5 направлениям">
            <Sparkles size={16} /> Баланс 5 сфер
          </button>
          <button className="button secondary" onClick={demo} title="Сбросить на исходное демо">
            <RotateCcw size={16} /> Сброс
          </button>
        </div>
      </div>

      {/* JSON Import/Export Modal */}
      {showJsonModal && (
        <div className="json-modal-overlay">
          <div className="panel json-modal-card">
            <div className="flex-between">
              <PanelTitle eyebrow="API CONTRACT" title="JSON план решений (/api/validate & /api/simulate)" />
              <button className="text-button" onClick={() => setShowJsonModal(false)}>Закрыть ×</button>
            </div>
            <p className="small muted">
              Вставьте JSON с 5 решениями. Поле <code>district</code> опционально (для общегородских мер, таких как M12, передается <code>null</code> или опускается):
            </p>
            <textarea
              className="json-textarea"
              rows={9}
              value={jsonInput}
              onChange={e => setJsonInput(e.target.value)}
            />
            {jsonError && <div className="notice danger">{jsonError}</div>}
            <div className="flex-between" style={{ marginTop: 14 }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <button className="button secondary" onClick={() => setJsonInput(JSON.stringify({ decisions: CONTROL_PLAN }, null, 2))}>
                  Вставить эталон ТЗ
                </button>
                <button className="button secondary" onClick={copyCurrentJson}>
                  <Copy size={14} /> {copySuccess ? 'Скопировано!' : 'Копировать'}
                </button>
              </div>
              <button className="button primary" onClick={applyJson}>
                <Upload size={14} /> Применить в конструктор
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5 Directions Tracker Bar */}
      <section className="direction-tracker-bar" aria-label="Баланс по 5 направлениям">
        <div className="tracker-label">
          <span>БАЛАНС 5 НАПРАВЛЕНИЙ:</span>
          <small className="muted">макс. {context.constraints.max_per_direction} на сферу</small>
        </div>
        <div className="tracker-chips">
          {CITY_DOMAINS.map(dom => {
            const count = directionCounts[dom.name] || 0
            const isFull = count === context.constraints.max_per_direction
            const isOver = count > context.constraints.max_per_direction
            const isZero = count === 0
            return (
              <div
                key={dom.id}
                className={`tracker-chip ${isOver ? 'over' : isFull ? 'full' : isZero ? 'zero' : 'active'}`}
                title={`${dom.name}: выбрано ${count} из ${context.constraints.max_per_direction}`}
              >
                <span className="tracker-icon">{directionIcon(dom.name, 14)}</span>
                <span className="tracker-name">{dom.name}</span>
                <strong className="tracker-count">{count}/{context.constraints.max_per_direction}</strong>
              </div>
            )
          })}
        </div>
      </section>

      <div className="builder-layout">
        <section>
          {/* Filter and Search Bar */}
          <div className="builder-controls">
            <div className="search-field">
              <Search size={16} />
              <input
                type="text"
                placeholder="Поиск по названию, коду (M1, T1...) или эффектам"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && <button className="clear-search" onClick={() => setSearchQuery('')}>×</button>}
            </div>

            <div className="filter-row" aria-label="Фильтр направлений">
              {['Все направления', ...directions].map(direction => (
                <button
                  key={direction}
                  className={`filter-chip ${filter === direction ? 'active' : ''}`}
                  aria-pressed={filter === direction}
                  onClick={() => setFilter(direction)}
                >
                  {direction !== 'Все направления' && directionIcon(direction, 14)}
                  {direction}
                </button>
              ))}
            </div>
          </div>

          <div className="measure-grid">
            {measures.map(measure => {
              const selection = decisions.find(d => d.measure_id === measure.id)
              const synergy = getSynergyStatus(measure.id)

              return (
                <article className={`measure-card ${selection ? 'selected' : ''}`} key={measure.id} data-testid={`measure-${measure.id}`}>
                  <div className="flex-between">
                    <span className={`direction-tag ${directionClass(measure.direction)}`}>
                      {directionIcon(measure.direction, 14)}
                      {measure.direction}
                    </span>
                    <span className="measure-id">{measure.id}</span>
                  </div>

                  <h2>{measure.name}</h2>

                  {/* Synergy Callout */}
                  {synergy && (
                    <div className={`synergy-tag ${synergy.active ? 'active' : 'ready'}`}>
                      <Zap size={13} />
                      <span>{synergy.text}</span>
                    </div>
                  )}

                  <div className="measure-meta">
                    <span className="meta-cost"><Wallet size={14} />{measure.cost} ед.</span>
                    <span><Clock3 size={14} />лаг {measure.lag} кв.</span>
                    <span>
                      {measure.scope === 'city' ? <Globe2 size={14} /> : <MapPin size={14} />}
                      {measure.scope === 'city' ? 'Весь город' : 'Один район'}
                    </span>
                  </div>

                  <div className="effect-chips">
                    {Object.entries(measure.effects).map(([id, value]) => (
                      <span key={id} className={value < 0 ? 'negative-effect' : ''} title={context.indicators[id]?.name}>
                        {id} {signed(value)}
                      </span>
                    ))}
                  </div>

                  <div className="measure-bottom">
                    {selection && measure.scope === 'district' ? (
                      <label className="select-field">
                        <span className="sr-only">Район для {measure.id}</span>
                        <MapPin size={15} />
                        <select
                          aria-label={`Район для ${measure.id}`}
                          value={selection.district ?? ''}
                          onChange={e => setDecisions(decisions.map(d => d.measure_id === measure.id ? { ...d, district: e.target.value || null } : d))}
                        >
                          <option value="">Выберите район</option>
                          {context.districts.map(d => <option key={d.name}>{d.name}</option>)}
                        </select>
                        <ChevronDown size={14} />
                      </label>
                    ) : (
                      <span className="small muted">
                        {selection ? 'Применится ко всем районам' : `Полный охват: ${measure.scope === 'city' ? 'Астана' : 'район'}`}
                      </span>
                    )}

                    <button
                      aria-label={`${selection ? 'Убрать' : 'Добавить'} ${measure.id}`}
                      aria-pressed={!!selection}
                      onClick={() => toggle(measure.id)}
                      className={`choose-button ${selection ? 'chosen' : ''}`}
                    >
                      {selection ? <Check size={16} /> : <Plus size={16} />}
                      {selection ? 'Выбрано' : 'Выбрать'}
                    </button>
                  </div>
                </article>
              )
            })}
          </div>

          <details className="rules-details">
            <summary>
              <CircleHelp size={16} />
              Правила симулятора и несовместимости мероприятий
              <ChevronDown size={16} />
            </summary>
            <div>
              <p>
                <strong>Бюджет:</strong> {context.budget} единиц. Выберите ровно {context.constraints.decision_count} мероприятий.
                Максимум {context.constraints.max_per_direction} на одно направление.
                Эффекты рассчитываются на {context.horizon} кварталов с учётом лагов реализации.
              </p>
              <ul>
                {context.constraints.incompatibilities.map((item, i) => (
                  <li key={i}>
                    <strong>{item.measures.join(' + ')}:</strong> {item.same_district_only ? 'нельзя применять в одном районе' : 'нельзя выбирать одновременно в плане'}.
                    {item.reason && ` ${item.reason}`}
                  </li>
                ))}
              </ul>
              <p className="small muted">Симулятор строго проверяет все ограничения через детерминированный движок.</p>
            </div>
          </details>
        </section>

        <aside className="plan-sidebar panel">
          <PanelTitle
            eyebrow="СТРАТЕГИЧЕСКИЙ ПОРТФЕЛЬ"
            title="Ваш план решений"
            right={<span className="count-pill">{decisions.length}/{context.constraints.decision_count}</span>}
          />

          <div className="budget-box">
            <div className="flex-between">
              <span>Распределение бюджета</span>
              <Wallet size={16} />
            </div>
            <div className="budget-number">
              {validating ? (
                <span className="budget-loading">Проверяем…</span>
              ) : (
                <>
                  <strong>{validation?.budget.used ?? '0'}</strong>
                  <span>/ {context.budget} ед.</span>
                </>
              )}
            </div>
            <div className={`budget-track ${validation && validation.budget.remaining < 0 ? 'over' : ''}`}>
              <i style={{ width: `${validation ? Math.min(100, Math.max(0, validation.budget.used / context.budget * 100)) : 0}%` }} />
            </div>
            <div className="flex-between small">
              <span>Остаток бюджета:</span>
              <strong className={validation && validation.budget.remaining < 0 ? 'text-red' : ''}>
                {validating ? '…' : validation?.budget.remaining ?? context.budget} ед.
              </strong>
            </div>
          </div>

          <div className="selected-list">
            {decisions.map((decision, index) => {
              const measure = context.measures.find(m => m.id === decision.measure_id)
              if (!measure) return null
              return (
                <div className="selected-item" key={decision.measure_id}>
                  <span className="selection-index">{String(index + 1).padStart(2, '0')}</span>
                  <div>
                    <strong>{measure.name}</strong>
                    <span>
                      {decision.district ?? (measure.scope === 'city' ? 'Весь город' : 'Укажите район')} · {measure.cost} ед.
                    </span>
                  </div>
                  <button className="icon-button" aria-label={`Удалить ${decision.measure_id}`} onClick={() => toggle(decision.measure_id)}>
                    <Trash2 size={15} />
                  </button>
                </div>
              )
            })}

            {Array.from({ length: Math.max(0, context.constraints.decision_count - decisions.length) }, (_, i) => (
              <div className="empty-slot" key={i}>
                <span>{String(decisions.length + i + 1).padStart(2, '0')}</span>
                Выберите мероприятие в каталоге
              </div>
            ))}
          </div>

          <div className="validation-area" aria-live="polite">
            {validating ? (
              <Loading>Проверяем план…</Loading>
            ) : validationError ? (
              <ErrorNotice message={validationError} retry={retry} />
            ) : validation?.valid ? (
              <div className="valid-plan">
                <Check size={16} />
                План проверен. Готов к расчету AQLS!
              </div>
            ) : validation && decisions.length > 0 && (
              <ul className="validation-errors">
                {validation.errors.map((error, i) => (
                  <li key={`${error.code}-${i}`}>{error.message}</li>
                ))}
              </ul>
            )}
          </div>

          <button
            className="button primary full calculate-btn"
            onClick={simulate}
            disabled={!validation?.valid || validating || simulating}
          >
            {simulating ? 'Рассчитываем в симуляторе…' : 'Рассчитать стратегию'}
            {!simulating && <ArrowRight size={17} />}
          </button>

          {decisions.length > 0 && (
            <button className="text-button reset-plan" onClick={() => setDecisions([])} disabled={simulating}>
              Очистить выбор
            </button>
          )}

          <p className="plan-footnote">
            Расчёт детерминирован формулой AQLS.<br />
            Никаких случайных чисел или галлюцинаций.
          </p>
        </aside>
      </div>
    </div>
  )
}

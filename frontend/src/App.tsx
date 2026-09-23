import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  ChevronRight,
  Flame,
  LayoutDashboard,
  MapPin,
  Menu,
  PanelLeftClose,
  Presentation,
  SlidersHorizontal,
  Sparkles,
  Trophy,
  Wallet,
  X,
} from 'lucide-react'
import { errorText, request } from './api'
import { CITY_DOMAINS, ErrorNotice, Loading, ModelNote } from './components'
import Overview from './Overview'
import Builder from './Builder'
import Results from './Results'
import Advisor from './Advisor'
import Crisis from './Crisis'
import Leaderboard from './Leaderboard'
import PitchDeck from './PitchDeck'
import type { Analysis, CityContext, Decision, Page, Simulation, Validation } from './types'

const navigation = [
  { id: 'overview' as const, label: 'Обзор города', icon: LayoutDashboard },
  { id: 'builder' as const, label: 'Конструктор решений', icon: SlidersHorizontal },
  { id: 'results' as const, label: 'Результаты & Радар', icon: BarChart3 },
  { id: 'advisor' as const, label: 'AI-советник', icon: Sparkles },
  { id: 'crisis' as const, label: 'Стресс-тест ЧС', icon: Flame },
  { id: 'leaderboard' as const, label: 'Рейтинг команд', icon: Trophy },
  { id: 'pitch' as const, label: 'Доклад Акиму', icon: Presentation },
]

export default function App() {
  const [page, setPage] = useState<Page>('overview')
  const [menu, setMenu] = useState(false)
  const [context, setContext] = useState<CityContext | null>(null)
  const [contextError, setContextError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [reload, setReload] = useState(0)
  const [decisions, updateDecisions] = useState<Decision[]>([])
  const [validation, setValidation] = useState<Validation | null>(null)
  const [validating, setValidating] = useState(false)
  const [validationError, setValidationError] = useState<string | null>(null)
  const [validateVersion, setValidateVersion] = useState(0)
  const [result, setResult] = useState<Simulation | null>(null)
  const [previous, setPrevious] = useState<Simulation | null>(null)
  const lastResult = useRef<Simulation | null>(null)
  const [simulating, setSimulating] = useState(false)
  const [actionError, setActionError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<Analysis | null>(null)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisVersion, setAnalysisVersion] = useState(0)
  const runController = useRef<AbortController | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    setLoading(true)
    setContextError(null)
    request<CityContext>('/context', undefined, controller.signal)
      .then(ctx => {
        setContext(ctx)
        updateDecisions(ctx.demo_plan.map(d => ({ ...d })))
      })
      .catch(e => {
        if (!controller.signal.aborted) setContextError(errorText(e))
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [reload])

  useEffect(() => {
    if (!context) return
    const controller = new AbortController()
    setValidating(true)
    setValidationError(null)
    const timer = window.setTimeout(() => {
      request<Validation>('/validate', { decisions }, controller.signal)
        .then(response => {
          if (!controller.signal.aborted) setValidation(response)
        })
        .catch(e => {
          if (!controller.signal.aborted) setValidationError(errorText(e))
        })
        .finally(() => {
          if (!controller.signal.aborted) setValidating(false)
        })
    }, 200)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [context, decisions, validateVersion])

  useEffect(() => {
    if (!result) {
      setAnalysis(null)
      setAnalyzing(false)
      return
    }
    const controller = new AbortController()
    setAnalyzing(true)
    setAnalysis(null)
    request<Analysis>('/analyze', result, controller.signal)
      .then(response => {
        if (!controller.signal.aborted) setAnalysis(response)
      })
      .catch(e => {
        if (!controller.signal.aborted)
          setAnalysis({ available: false, explanation: null, message: errorText(e) })
      })
      .finally(() => {
        if (!controller.signal.aborted) setAnalyzing(false)
      })
    return () => controller.abort()
  }, [result, analysisVersion])

  function go(next: Page) {
    setPage(next)
    setMenu(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  const setDecisions = useCallback((next: Decision[]) => {
    runController.current?.abort()
    setSimulating(false)
    setResult(null)
    setAnalysis(null)
    setActionError(null)
    setValidation(null)
    updateDecisions(next)
  }, [])

  function acceptResult(next: Simulation) {
    const last = lastResult.current
    if (last && JSON.stringify(last.decisions) !== JSON.stringify(next.decisions))
      setPrevious(last)
    lastResult.current = next
    setResult(next)
    go('results')
  }

  async function simulate() {
    runController.current?.abort()
    const controller = new AbortController()
    runController.current = controller
    setSimulating(true)
    setActionError(null)
    try {
      const response = await request<Simulation | Validation>(
        '/simulate',
        { decisions },
        controller.signal
      )
      if (controller.signal.aborted) return
      if ('score' in response && response.valid) acceptResult(response)
      else {
        setValidation(response as Validation)
        setResult(null)
      }
    } catch (e) {
      if (!controller.signal.aborted) setActionError(errorText(e))
    } finally {
      if (!controller.signal.aborted) setSimulating(false)
    }
  }

  const demo = () => {
    if (context) {
      setDecisions(context.demo_plan.map(d => ({ ...d })))
      go('builder')
    }
  }

  const apply = (scenario: Simulation) => {
    setDecisions(scenario.decisions.map(d => ({ ...d })))
    acceptResult(scenario)
  }

  // Count directions
  const directionCounts: Record<string, number> = {}
  if (context) {
    for (const d of decisions) {
      const m = context.measures.find(measure => measure.id === d.measure_id)
      if (m) directionCounts[m.direction] = (directionCounts[m.direction] || 0) + 1
    }
  }

  return (
    <div className="app-shell">
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>
      {menu && <button className="menu-overlay" aria-label="Закрыть меню" onClick={() => setMenu(false)} />}

      <aside className={`sidebar ${menu ? 'open' : ''}`}>
        <a className="brand" href="#" onClick={e => { e.preventDefault(); go('overview') }}>
          <span className="brand-symbol">
            <Building2 size={26} strokeWidth={1.8} />
          </span>
          <span>
            Аким<span className="brand-sub">НА 5 ЧАСОВ</span>
          </span>
        </a>

        <button className="icon-button sidebar-close" onClick={() => setMenu(false)} aria-label="Скрыть навигацию">
          <X size={19} />
        </button>

        <div className="workspace-label">СИТУАЦИОННЫЙ ЦЕНТР АСТАНЫ</div>

        <nav aria-label="Основная навигация">
          {navigation.map(item => (
            <button
              key={item.id}
              className={`nav-item ${page === item.id ? 'active' : ''}`}
              aria-current={page === item.id ? 'page' : undefined}
              onClick={() => go(item.id)}
            >
              <item.icon size={18} strokeWidth={1.8} />
              <span>{item.label}</span>
              {item.id === 'advisor' && <span className="nav-ai" aria-hidden="true">AI</span>}
              {item.id === 'crisis' && <span className="nav-crisis-tag">ЧС</span>}
              {item.id === 'results' && result && <span className="nav-result-dot" />}
            </button>
          ))}
        </nav>

        <div className="sidebar-divider" />

        <div className="sidebar-location">
          <MapPin size={16} />
          <div>
            Астана, Казахстан
            <span>AI Urban Strategy Copilot</span>
          </div>
        </div>

        <div className="sidebar-bottom">
          <div className="sidebar-callout">
            <span className="eyebrow">5 НАПРАВЛЕНИЙ РАЗВИТИЯ</span>
            <p>Транспорт · Экология · Соцсфера · Безопасность · Сервисы</p>
            <button onClick={() => go('pitch')}>
              Смотреть доклад <ArrowUpRight size={16} />
            </button>
          </div>

          <div className="hackalem-mark">
            <span>HACK<span>ALEM</span></span>
            <span className="hack-year">AI CHALLENGE 2026</span>
          </div>

          <div className="sidebar-version">
            <span className={`connection-dot ${context ? '' : 'offline'}`} />
            {context ? 'Модель подключена' : 'Подключение к модели'}
            <PanelLeftClose size={13} />
          </div>
        </div>
      </aside>

      <div className="app-main">
        <header className="topbar">
          <div className="breadcrumbs">
            <button className="icon-button mobile-menu" aria-label="Открыть меню" onClick={() => setMenu(true)}>
              <Menu size={21} />
            </button>
            <span className="breadcrumb-root">Ситуационный центр</span>
            <ChevronRight size={14} />
            <strong>{navigation.find(n => n.id === page)?.label}</strong>
          </div>

          {/* Quick status in topbar */}
          <div className="topbar-right">
            {context && (
              <div className="topbar-status-bar">
                <div className="topbar-balance-dots" title="Покрытие 5 направлений">
                  {CITY_DOMAINS.map(d => {
                    const cnt = directionCounts[d.name] || 0
                    return (
                      <span
                        key={d.id}
                        className={`domain-mini-dot ${cnt > 0 ? 'filled' : 'empty'}`}
                        style={{ backgroundColor: cnt > 0 ? d.color : undefined }}
                        title={`${d.name}: ${cnt}/2`}
                      />
                    )
                  })}
                </div>
                <div className="topbar-budget-pill">
                  <Wallet size={13} />
                  <span>{validation?.budget.used ?? 0}/100 ед.</span>
                </div>
              </div>
            )}
            <span className="model-label">
              <span /> СИМУЛЯЦИЯ
            </span>
            <div className="user-avatar" title="Аким / Главный стратег">
              АКИМ
            </div>
          </div>
        </header>

        <main id="main-content" tabIndex={-1}>
          {loading ? (
            <div className="initial-loading">
              <div className="brand-symbol">
                <Building2 size={31} />
              </div>
              <Loading>Загружаем цифровую модель Астаны…</Loading>
            </div>
          ) : contextError ? (
            <div className="connection-error">
              <h1>Цифровая модель пока недоступна</h1>
              <p>Не удалось связаться с сервером симулятора города.</p>
              <ErrorNotice message={contextError} retry={() => setReload(v => v + 1)} />
            </div>
          ) : (
            context && (
              <>
                {actionError && <ErrorNotice message={actionError} retry={simulate} />}

                {page === 'overview' && (
                  <Overview
                    context={context}
                    selectedCount={decisions.length}
                    go={go}
                    demo={demo}
                  />
                )}

                {page === 'builder' && (
                  <Builder
                    context={context}
                    decisions={decisions}
                    setDecisions={setDecisions}
                    validation={validation}
                    validating={validating}
                    validationError={validationError}
                    retry={() => setValidateVersion(v => v + 1)}
                    simulate={() => void simulate()}
                    simulating={simulating}
                    demo={demo}
                  />
                )}

                {page === 'results' && (
                  <Results
                    key={JSON.stringify(result?.decisions)}
                    context={context}
                    result={result}
                    previous={previous}
                    edit={() => go('builder')}
                    advisor={() => go('advisor')}
                    analysis={analysis}
                    analyzing={analyzing}
                    analyze={() => setAnalysisVersion(v => v + 1)}
                    go={go}
                  />
                )}

                <div hidden={page !== 'advisor'}>
                  <Advisor
                    context={context}
                    decisions={decisions}
                    previous={previous}
                    apply={apply}
                  />
                </div>

                {page === 'crisis' && (
                  <Crisis context={context} result={result} go={go} />
                )}

                {page === 'leaderboard' && (
                  <Leaderboard
                    context={context}
                    result={result}
                    apply={apply}
                    go={go}
                  />
                )}

                {page === 'pitch' && (
                  <PitchDeck
                    context={context}
                    result={result}
                    analysis={analysis}
                    go={go}
                  />
                )}

                <footer className="page-footer no-print">
                  <ModelNote />
                  <span>Хакатон «Аким на 5 часов» · AI Urban Strategy Copilot</span>
                </footer>
              </>
            )
          )}
        </main>
      </div>
    </div>
  )
}

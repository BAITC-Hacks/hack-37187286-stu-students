import { useCallback, useEffect, useRef, useState } from 'react'
import {
  ArrowUpRight,
  BarChart3,
  Building2,
  Check,
  ChevronDown,
  ChevronRight,
  Flame,
  LayoutDashboard,
  MapPin,
  Menu,
  PanelLeft,
  PanelLeftClose,
  Presentation,
  RotateCcw,
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)
  const [profileOpen, setProfileOpen] = useState(false)
  const [quickNavOpen, setQuickNavOpen] = useState(false)
  const profileRef = useRef<HTMLDivElement>(null)
  const quickNavRef = useRef<HTMLDivElement>(null)
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
    setQuickNavOpen(false)
    setProfileOpen(false)
    window.scrollTo({ top: 0, behavior: 'instant' })
  }

  // Outside click and Escape key listener for profile and quick switcher
  useEffect(() => {
    function handleOutside(e: MouseEvent | TouchEvent) {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setProfileOpen(false)
      }
      if (quickNavRef.current && !quickNavRef.current.contains(e.target as Node)) {
        setQuickNavOpen(false)
      }
    }
    function handleKeydown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        setProfileOpen(false)
        setQuickNavOpen(false)
      }
    }
    if (profileOpen || quickNavOpen) {
      document.addEventListener('mousedown', handleOutside)
      document.addEventListener('touchstart', handleOutside)
      document.addEventListener('keydown', handleKeydown)
    }
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
      document.removeEventListener('keydown', handleKeydown)
    }
  }, [profileOpen, quickNavOpen])

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

  const loadDemo = () => {
    demo()
    setProfileOpen(false)
  }

  const resetPlan = () => {
    setDecisions([])
    setResult(null)
    setAnalysis(null)
    setProfileOpen(false)
    go('builder')
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
    <div className={`app-shell ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
      <a href="#main-content" className="skip-link">Перейти к содержимому</a>
      {menu && <button className="menu-overlay" aria-label="Закрыть меню" onClick={() => setMenu(false)} />}

      <aside className={`sidebar ${menu ? 'open' : ''} ${sidebarCollapsed ? 'collapsed' : ''}`}>
        <a className="brand" href="#" onClick={e => { e.preventDefault(); go('overview') }}>
          <span className="brand-symbol">
            <Building2 size={26} strokeWidth={1.8} />
          </span>
          <span>
            Аким<span className="brand-sub">НА 5 ЧАСОВ</span>
          </span>
        </a>

        <button
          className="icon-button sidebar-close"
          onClick={() => {
            if (window.innerWidth <= 1000) setMenu(false)
            else setSidebarCollapsed(true)
          }}
          aria-label="Скрыть навигацию"
        >
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

          <button
            type="button"
            className="sidebar-version sidebar-collapse-trigger"
            onClick={() => setSidebarCollapsed(true)}
            title="Свернуть боковую панель для полноэкранного режима"
          >
            <span className={`connection-dot ${context ? '' : 'offline'}`} />
            {context ? 'Модель подключена' : 'Подключение к модели'}
            <PanelLeftClose size={13} />
          </button>
        </div>
      </aside>

      <div className={`app-main ${sidebarCollapsed ? 'sidebar-collapsed' : ''}`}>
        <header className="topbar">
          <div className="breadcrumbs">
            {/* Toggle sidebar button (desktop collapse / mobile open) */}
            <button
              type="button"
              className="icon-button topbar-menu-toggle"
              aria-label={sidebarCollapsed ? 'Развернуть меню' : 'Переключить панель'}
              onClick={() => {
                if (window.innerWidth <= 1000) {
                  setMenu(v => !v)
                } else {
                  setSidebarCollapsed(v => !v)
                }
              }}
              title={sidebarCollapsed ? 'Развернуть панель' : 'Свернуть панель'}
            >
              {sidebarCollapsed ? <PanelLeft size={18} /> : <Menu size={18} />}
            </button>

            {/* Breadcrumb root: interactive button */}
            <button
              type="button"
              className="breadcrumb-btn breadcrumb-root"
              onClick={() => go('overview')}
              title="Перейти в Ситуационный центр (Обзор города)"
            >
              Ситуационный центр
            </button>

            <ChevronRight size={13} className="breadcrumb-separator" />

            {/* Quick page switcher dropdown */}
            <div className="breadcrumb-nav-wrapper" ref={quickNavRef}>
              <button
                type="button"
                className="breadcrumb-current-btn"
                onClick={() => setQuickNavOpen(v => !v)}
                aria-expanded={quickNavOpen}
                title="Нажмите для быстрого перехода к другому разделу"
              >
                <strong>{navigation.find(n => n.id === page)?.label}</strong>
                <ChevronDown size={13} className={`breadcrumb-arrow ${quickNavOpen ? 'open' : ''}`} />
              </button>

              {quickNavOpen && (
                <div className="breadcrumb-dropdown" role="menu">
                  <div className="dropdown-label">РАЗДЕЛЫ СИСТЕМЫ</div>
                  {navigation.map(item => {
                    const Icon = item.icon
                    const isCurrent = item.id === page
                    return (
                      <button
                        key={item.id}
                        type="button"
                        className={`breadcrumb-dropdown-item ${isCurrent ? 'active' : ''}`}
                        onClick={() => {
                          go(item.id)
                          setQuickNavOpen(false)
                        }}
                      >
                        <Icon size={14} />
                        <span>{item.label}</span>
                        {isCurrent && <Check size={13} className="item-check" />}
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          </div>

          {/* Quick status in topbar */}
          <div className="topbar-right">
            {context && (
              <div className="topbar-status-bar">
                {/* 5 Domains Coverage button */}
                <button
                  type="button"
                  className="topbar-balance-dots"
                  onClick={() => go('builder')}
                  title="Покрытие 5 направлений: кликните для настройки в Конструкторе"
                  aria-label="Покрытие 5 направлений"
                >
                  {CITY_DOMAINS.map(d => {
                    const cnt = directionCounts[d.name] || 0
                    return (
                      <span
                        key={d.id}
                        className={`domain-mini-dot ${cnt > 0 ? 'dot-filled' : 'dot-empty'}`}
                        style={{ backgroundColor: cnt > 0 ? d.color : undefined }}
                        title={`${d.name}: ${cnt}/2`}
                      />
                    )
                  })}
                </button>

                {/* Budget Pill Button */}
                <button
                  type="button"
                  className="topbar-budget-pill"
                  onClick={() => go('builder')}
                  title="Бюджет решений: кликните для перехода в Конструктор решений"
                  aria-label={`Использовано ${validation?.budget.used ?? 0} из 100 единиц бюджета`}
                >
                  <Wallet size={13} />
                  <span>{validation?.budget.used ?? 0}/100 ед.</span>
                </button>
              </div>
            )}

            {/* Simulation mode indicator button */}
            <button
              type="button"
              className="model-label-btn"
              onClick={() => go('advisor')}
              title="Цифровая модель города активна (Digital Twin v3.11). Кликните для перехода к AI-советнику"
              aria-label="Статус симуляции: активна"
            >
              <span className="pulse-dot" />
              <span>СИМУЛЯЦИЯ</span>
            </button>

            {/* Profile Avatar & Dropdown */}
            <div className="profile-wrapper" ref={profileRef}>
              <button
                type="button"
                className={`user-avatar-btn ${profileOpen ? 'active' : ''}`}
                onClick={() => setProfileOpen(v => !v)}
                aria-expanded={profileOpen}
                aria-haspopup="true"
                title="Профиль стратега и быстрые действия"
                aria-label="Открыть профиль стратега"
              >
                <span className="user-avatar-badge">АК</span>
                <span className="user-avatar-online" />
              </button>

              {profileOpen && (
                <div className="profile-dropdown" role="menu">
                  <div className="profile-header">
                    <div className="profile-avatar-large">
                      <span>АК</span>
                    </div>
                    <div className="profile-user-info">
                      <div className="profile-name">Аким г. Астана</div>
                      <div className="profile-role">Главный стратег · Штаб ситуационного центра</div>
                      <div className="profile-status">
                        <span className="status-indicator online" />
                        Цифровой двойник подключен (v3.11)
                      </div>
                    </div>
                  </div>

                  <div className="profile-metrics">
                    <div className="profile-metric-card">
                      <div className="metric-label">Бюджет</div>
                      <div className="metric-value">
                        <Wallet size={12} />
                        <strong>{validation?.budget.used ?? 0}</strong>
                        <span>/100 ед.</span>
                      </div>
                      <div className="profile-mini-bar">
                        <div
                          className="profile-mini-progress"
                          style={{
                            width: `${Math.min(100, validation?.budget.used ?? 0)}%`,
                            backgroundColor: (validation?.budget.used ?? 0) > 100 ? '#ef4444' : '#10b981'
                          }}
                        />
                      </div>
                    </div>

                    <div className="profile-metric-card">
                      <div className="metric-label">AQLS Индекс</div>
                      <div className="metric-value text-emerald">
                        <strong>
                          {result?.score?.after
                            ? result.score.after.toFixed(1)
                            : (context?.baseline.score.toFixed(1) ?? '52.6')}
                        </strong>
                        <span>/100</span>
                      </div>
                      <div className="metric-sub">
                        {result?.score ? 'После симуляции' : 'Базовый уровень'}
                      </div>
                    </div>

                    <div className="profile-metric-card">
                      <div className="metric-label">Меры & Баланс</div>
                      <div className="metric-value">
                        <strong>{decisions.length}</strong>
                        <span>/10 мер</span>
                      </div>
                      <div className="metric-sub">
                        {CITY_DOMAINS.filter(d => (directionCounts[d.name] || 0) > 0).length}/5 направлений
                      </div>
                    </div>
                  </div>

                  <div className="profile-actions-title">БЫСТРЫЕ ДЕЙСТВИЯ СТРАТЕГА</div>
                  <div className="profile-actions">
                    <button
                      type="button"
                      className="profile-action-btn"
                      onClick={loadDemo}
                    >
                      <Sparkles size={15} className="text-emerald" />
                      <div>
                        <strong>Загрузить эталонное демо</strong>
                        <small>Проверенный баланс 5 направлений на 95 ед.</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="profile-action-btn"
                      onClick={resetPlan}
                    >
                      <RotateCcw size={15} className="text-amber" />
                      <div>
                        <strong>Сбросить план решений</strong>
                        <small>Очистить корзину мер и собрать заново</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="profile-action-btn"
                      onClick={() => {
                        go('pitch')
                        setProfileOpen(false)
                      }}
                    >
                      <Presentation size={15} className="text-purple" />
                      <div>
                        <strong>Презентация / Доклад Акиму</strong>
                        <small>Экспорт стратегии и слайд-шоу для жюри</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="profile-action-btn"
                      onClick={() => {
                        go('crisis')
                        setProfileOpen(false)
                      }}
                    >
                      <Flame size={15} className="text-red" />
                      <div>
                        <strong>Стресс-тест форс-мажоров</strong>
                        <small>Мороз -38°C, снегопад, энергокризис</small>
                      </div>
                    </button>

                    <button
                      type="button"
                      className="profile-action-btn"
                      onClick={() => {
                        go('leaderboard')
                        setProfileOpen(false)
                      }}
                    >
                      <Trophy size={15} className="text-cyan" />
                      <div>
                        <strong>Рейтинг команд</strong>
                        <small>Сравнить сценарий с бенчмарками</small>
                      </div>
                    </button>
                  </div>

                  <div className="profile-footer">
                    <span>OSM MBTiles GIS · FastAPI backend · Астана</span>
                  </div>
                </div>
              )}
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

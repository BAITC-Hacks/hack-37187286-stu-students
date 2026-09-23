import { useState } from 'react'
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Snowflake,
  TrendingDown,
  Users,
} from 'lucide-react'
import { format } from './api'
import { Delta, PanelTitle } from './components'
import type { CityContext, CityCrisis, CrisisEvaluation, Page, Simulation } from './types'

const CRISES: CityCrisis[] = [
  {
    id: 'blizzard',
    title: 'Аномальный буран и мороз -38°C',
    badge: 'КЛИМАТИЧЕСКИЙ КРИЗИС',
    severity: 'critical',
    iconName: 'Snowflake',
    description: 'Ураганный ветер, снежные заносы и экстремальные морозы парализуют дороги и создают пиковую нагрузку на теплосети и энергоснабжение Астаны.',
    historicalNote: 'Типичный стресс-тест для Астаны: при неготовности ЖКХ температура в домах падает, а магистрали блокируются за несколько часов.',
    shockEffects: {
      C1: -16, // Надёжность ЖКХ
      T1: -14, // Разгрузка дорог
      C2: -10, // Скорость решения обращений
      E2: -6,  // Качество воздуха (рост выбросов от ТЭЦ и печей)
    },
    mitigatingMeasures: ['M13', 'M14', 'M2', 'M5', 'M6'],
  },
  {
    id: 'demography',
    title: 'Миграционный приток (+35 000 жителей)',
    badge: 'СОЦИАЛЬНЫЙ ВЫЗОВ',
    severity: 'high',
    iconName: 'Users',
    description: 'Стремительный прирост населения столицы за год. Резкая перегрузка школ в новых микрорайонах (Нура, Есиль), дефицит врачей общей практики.',
    historicalNote: 'Астана растет на десятки тысяч жителей в год — социальная инфраструктура критически отстает, если строить только жилье.',
    shockEffects: {
      S1: -18, // Школы и детсады
      S2: -14, // Поликлиники и первичная медпомощь
      T2: -10, // Доступность общественного транспорта
    },
    mitigatingMeasures: ['M7', 'M8', 'M9', 'M1', 'M3'],
  },
  {
    id: 'summit',
    title: 'Саммит ШОС и Международный форум',
    badge: 'БЕЗОПАСНОСТЬ И ЛОГИСТИКА',
    severity: 'high',
    iconName: 'ShieldAlert',
    description: 'Прибытие 40+ зарубежных делегаций. Перекрытие правительственных трасс, колоссальные требования к общественной безопасности и мониторингу инцидентов.',
    historicalNote: 'Требует безупречной работы систем Safe City, адаптивного управления потоками транспорта и цифрового реагирования.',
    shockEffects: {
      B1: -14, // Безопасность улиц
      B2: -12, // Безопасность дорожного движения
      T1: -12, // Разгрузка дорог (заторы из-за кортежей)
      C2: -8,  // Обращения граждан
    },
    mitigatingMeasures: ['M10', 'M11', 'M2', 'M12'],
  },
]

export default function Crisis({
  context,
  result,
  go,
}: {
  context: CityContext
  result: Simulation | null
  go: (page: Page) => void
}) {
  const [selectedCrisisId, setSelectedCrisisId] = useState<string>('blizzard')

  const activeCrisis = CRISES.find(c => c.id === selectedCrisisId) ?? CRISES[0]

  // Calculate crisis evaluation
  const evaluateCrisis = (crisis: CityCrisis): CrisisEvaluation => {
    const selectedMeasures = new Set((result?.decisions ?? []).map(d => d.measure_id))
    const initialScore = result ? result.score.after : context.baseline.score

    let totalRawShock = 0
    let totalAbsorbed = 0
    const activeMitigations: string[] = []
    const unmitigatedShocks: { indicator: string; shock: number }[] = []

    for (const [indCode, shockVal] of Object.entries(crisis.shockEffects)) {
      totalRawShock += Math.abs(shockVal)

      // Check if user has mitigating measures
      const protectiveMeasures = crisis.mitigatingMeasures.filter(mId => selectedMeasures.has(mId))
      const hasProtection = protectiveMeasures.length > 0

      if (hasProtection) {
        // Absorbs 60% - 90% of shock depending on number of measures
        const cushionFactor = Math.min(0.85, 0.45 * protectiveMeasures.length)
        const absorbed = Math.abs(shockVal) * cushionFactor
        totalAbsorbed += absorbed
        protectiveMeasures.forEach(m => {
          if (!activeMitigations.includes(m)) activeMitigations.push(m)
        })
      } else {
        unmitigatedShocks.push({ indicator: indCode, shock: shockVal })
      }
    }

    const netShock = Math.max(0, totalRawShock - totalAbsorbed)
    // Scale shock to Score impact (roughly 0.35 weight)
    const scoreImpact = Math.round(netShock * 0.32 * 10) / 10
    const scoreWithShock = Math.max(20, Math.round((initialScore - scoreImpact) * 10) / 10)

    const resilienceRatio = totalRawShock > 0 ? totalAbsorbed / totalRawShock : 0
    const resilienceScore = Math.round(resilienceRatio * 100)

    let verdict: 'high' | 'medium' | 'vulnerable' = 'vulnerable'
    let verdictText = 'Критическая уязвимость: выбранный портфель мер не защищает город от удара.'
    if (resilienceScore >= 60) {
      verdict = 'high'
      verdictText = 'Высокая жизнестойкость: ваши инвестиции эффективно амортизировали последствия кризиса!'
    } else if (resilienceScore >= 30) {
      verdict = 'medium'
      verdictText = 'Частичная устойчивость: город устоял, но ряд сфер понёс чувствительные потери.'
    }

    return {
      crisis,
      resilienceScore,
      scoreWithShock,
      originalScore: initialScore,
      shockDelta: -scoreImpact,
      protectedPoints: Math.round(totalAbsorbed * 0.32 * 10) / 10,
      activeMitigations,
      unmitigatedShocks,
      verdict,
      verdictText,
    }
  }

  const evaluation = evaluateCrisis(activeCrisis)

  const getCrisisIcon = (name: string) => {
    switch (name) {
      case 'Snowflake':
        return <Snowflake size={26} className="text-cyan" />
      case 'Users':
        return <Users size={26} className="text-purple" />
      default:
        return <ShieldAlert size={26} className="text-amber" />
    }
  }

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">МОДЕЛИРОВАНИЕ НЕОЖИДАННЫХ СОБЫТИЙ · ЧРЕЗВЫЧАЙНЫЙ РЕЖИМ</div>
          <h1>Стресс-тест городских форс-мажоров</h1>
          <p>
            Проверьте, выдержит ли ваша стратегия реальные кризисы Астаны: аномальные морозы, миграционный всплеск или международные события.
          </p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => go('builder')}>
            <RotateCcw size={16} /> Скорректировать план
          </button>
        </div>
      </div>

      {/* Crisis Selection Grid */}
      <section className="crisis-selection-grid" aria-label="Сценарии кризисов">
        {CRISES.map(crisis => {
          const isSelected = crisis.id === selectedCrisisId
          return (
            <div
              key={crisis.id}
              className={`crisis-selector-card ${isSelected ? 'selected' : ''}`}
              onClick={() => setSelectedCrisisId(crisis.id)}
              role="button"
              tabIndex={0}
              onKeyDown={e => e.key === 'Enter' && setSelectedCrisisId(crisis.id)}
            >
              <div className="flex-between">
                <span className="crisis-badge">{crisis.badge}</span>
                <span className={`severity-tag ${crisis.severity}`}>
                  {crisis.severity === 'critical' ? 'Экстремальный' : 'Высокий риск'}
                </span>
              </div>
              <div className="crisis-card-header">
                <span className="crisis-icon-box">{getCrisisIcon(crisis.iconName)}</span>
                <h3>{crisis.title}</h3>
              </div>
              <p className="crisis-card-desc">{crisis.description}</p>
              <div className="crisis-card-footer">
                <span>{isSelected ? 'Активный сценарий' : 'Выбрать стресс-тест'}</span>
                <ChevronRight size={16} />
              </div>
            </div>
          )
        })}
      </section>

      {/* Stress Test Arena */}
      <div className="crisis-arena-grid">
        <section className="panel crisis-report-panel">
          <PanelTitle
            eyebrow="РЕЗУЛЬТАТЫ СТРЕСС-ТЕСТИРОВАНИЯ"
            title={`Испытание: ${activeCrisis.title}`}
            right={
              <span className={`resilience-badge ${evaluation.verdict}`}>
                {evaluation.verdict === 'high' ? <ShieldCheck size={16} /> : <ShieldAlert size={16} />}
                Индекс защиты: {evaluation.resilienceScore}%
              </span>
            }
          />

          <div className="crisis-score-impact">
            <div className="impact-box">
              <span>AQLS до кризиса</span>
              <strong>{format(evaluation.originalScore, 1)}</strong>
            </div>
            <div className="impact-arrow">
              <TrendingDown size={28} className={evaluation.resilienceScore > 50 ? 'text-amber' : 'text-red'} />
              <Delta value={evaluation.shockDelta} />
            </div>
            <div className="impact-box result-impact">
              <span>Итоговый AQLS при ЧС</span>
              <strong className={evaluation.scoreWithShock < 45 ? 'text-red' : ''}>
                {format(evaluation.scoreWithShock, 1)}
              </strong>
            </div>
          </div>

          <div className={`crisis-verdict-box ${evaluation.verdict}`}>
            <div className="verdict-icon">
              {evaluation.verdict === 'high' ? (
                <ShieldCheck size={24} />
              ) : (
                <AlertTriangle size={24} />
              )}
            </div>
            <div>
              <strong>{evaluation.verdictText}</strong>
              <p>{activeCrisis.historicalNote}</p>
            </div>
          </div>

          {/* Defense breakdown */}
          <div className="defense-breakdown">
            <h4>Сработавшие защитные меры в вашем плане:</h4>
            {evaluation.activeMitigations.length > 0 ? (
              <div className="active-shields-list">
                {evaluation.activeMitigations.map(mId => {
                  const measure = context.measures.find(m => m.id === mId)
                  return (
                    <div key={mId} className="shield-item">
                      <CheckCircle2 size={16} className="text-emerald" />
                      <div>
                        <strong>{mId}: {measure?.name}</strong>
                        <small>Снизило урон по ключевым системам города</small>
                      </div>
                    </div>
                  )
                })}
              </div>
            ) : (
              <div className="no-shields-notice">
                <AlertTriangle size={17} />
                <span>Ни одно из выбранных 5 решений не защищает город от этого кризиса!</span>
              </div>
            )}

            <h4 style={{ marginTop: 22 }}>Уязвимые зоны (незащищённый ущерб):</h4>
            <div className="unmitigated-list">
              {evaluation.unmitigatedShocks.map(item => (
                <div key={item.indicator} className="shock-pill">
                  <span className="shock-code">{item.indicator}</span>
                  <span className="shock-name">{context.indicators[item.indicator]?.name}</span>
                  <span className="shock-val">{item.shock}</span>
                </div>
              ))}
              {evaluation.unmitigatedShocks.length === 0 && (
                <div className="all-shielded-msg">
                  <ShieldCheck size={16} /> Все индикаторы были прикрыты вашими мероприятиями!
                </div>
              )}
            </div>
          </div>
        </section>

        {/* Sidebar: Recommendations & Strategic Advice */}
        <aside className="panel crisis-sidebar">
          <PanelTitle eyebrow="РЕКОМЕНДАЦИИ АКИМУ" title="Как усилить жизнестойкость" />
          <p className="muted small">
            Для нейтрализации этого события эксперты рекомендуют включить в портфель следующие меры:
          </p>

          <div className="recommended-measures-list">
            {activeCrisis.mitigatingMeasures.map(mId => {
              const measure = context.measures.find(m => m.id === mId)
              const isAlreadySelected = (result?.decisions ?? []).some(d => d.measure_id === mId)
              if (!measure) return null

              return (
                <div key={mId} className={`recom-card ${isAlreadySelected ? 'active' : ''}`}>
                  <div className="flex-between">
                    <span className="table-code">{mId}</span>
                    <span className="small muted">{measure.cost} ед.</span>
                  </div>
                  <strong>{measure.name}</strong>
                  <div className="recom-status">
                    {isAlreadySelected ? (
                      <span className="status-badge on"><Shield size={13} /> Уже в вашем плане</span>
                    ) : (
                      <span className="status-badge off">Рекомендуется добавить</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          <button className="button primary full" style={{ marginTop: 24 }} onClick={() => go('builder')}>
            Перейти в конструктор и усилить защиту <ArrowRight size={16} />
          </button>
        </aside>
      </div>
    </div>
  )
}

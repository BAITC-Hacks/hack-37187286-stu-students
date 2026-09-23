import { useState } from 'react'
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  MapPin,
  Printer,
  Sparkles,
  Wallet,
  Zap,
} from 'lucide-react'
import {
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  ResponsiveContainer,
} from 'recharts'
import { format } from './api'
import { calculateDomainScores, Delta, Empty } from './components'
import type { Analysis, CityContext, Page, Simulation } from './types'

export default function PitchDeck({
  context,
  result,
  analysis,
  go,
}: {
  context: CityContext
  result: Simulation | null
  analysis: Analysis | null
  go: (page: Page) => void
}) {
  const [currentSlide, setCurrentSlide] = useState(0)

  if (!result) {
    return (
      <Empty
        title="Нет рассчитанной стратегии для презентации"
        action={
          <button className="button primary" onClick={() => go('builder')}>
            Собрать решения в конструкторе <ArrowRight size={17} />
          </button>
        }
      >
        Сначала сформируйте и рассчитайте портфель из 5 решений в конструкторе. После этого симулятор сгенерирует готовый доклад для защиты перед Акимом и Жюри.
      </Empty>
    )
  }

  const domainData = calculateDomainScores(context, result).map(item => ({
    subject: item.domain,
    'Базовый': item.before,
    'После мер': item.after,
  }))

  const slides = [
    {
      id: 'slide-1',
      title: 'Слайд 1: Паспорт стратегии и исходные вызовы',
      content: (
        <div className="slide-body">
          <div className="slide-tag">АКИМАТ ГОРОДА АСТАНА · СИТУАЦИОННЫЙ ЦЕНТР</div>
          <h2>Стратегия комплексного развития столицы</h2>
          <p className="slide-subtitle">
            Программа управленческих решений в рамках фиксированного бюджета 100 единиц
          </p>

          <div className="slide-passport-grid">
            <div className="passport-box">
              <span className="muted">Базовый Score Астаны</span>
              <strong>{format(result.score.before, 1)}</strong>
              <small>Точка отсчёта до реализации плана</small>
            </div>
            <div className="passport-box">
              <span className="muted">Бюджет программы</span>
              <strong>{result.budget.used} / {result.budget.total} ед.</strong>
              <small>Эффективное распределение без перерасхода</small>
            </div>
            <div className="passport-box">
              <span className="muted">Принято решений</span>
              <strong>{result.decisions.length} из 5</strong>
              <small>По всем 5 направлениям ТЗ</small>
            </div>
            <div className="passport-box highlight">
              <span className="muted">Итоговый целевой AQLS</span>
              <strong>{format(result.score.after, 1)}</strong>
              <small><Delta value={result.score.delta} /> рост качества городской среды</small>
            </div>
          </div>

          <div className="slide-problem-statement">
            <h4>Ключевой фокус команды:</h4>
            <p>
              Ликвидация критического отставания проблемных районов (район <strong>{context.baseline.weakest_district}</strong>),
              балансировка транспортного каркаса и экологии, внедрение цифровых сервисов без превышения бюджетного лимита.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: 'slide-2',
      title: 'Слайд 2: Портфель 5 управленческих решений',
      content: (
        <div className="slide-body">
          <div className="slide-tag">ПАКЕТ ИНИЦИАТИВ</div>
          <h2>5 ключевых проектов программы</h2>
          <p className="slide-subtitle">
            Каждое мероприятие прошло проверку на совместимость, лаги и мультипликативный эффект
          </p>

          <div className="slide-decisions-list">
            {result.decisions.map((decision, idx) => {
              const m = context.measures.find(measure => measure.id === decision.measure_id)!
              return (
                <div key={decision.measure_id} className="slide-decision-item">
                  <div className="slide-decision-num">0{idx + 1}</div>
                  <div className="slide-decision-main">
                    <div className="flex-between">
                      <span className="slide-dir-badge">{m.direction}</span>
                      <span className="slide-cost-badge"><Wallet size={13} /> {m.cost} ед. бюджета</span>
                    </div>
                    <h3>{m.name}</h3>
                    <p className="slide-scope-text">
                      <MapPin size={13} /> Охват: <strong>{decision.district ?? 'Общегородской масштаб'}</strong> · Горизонт отдачи: {m.lag} кв.
                    </p>
                  </div>
                </div>
              )
            })}
          </div>

          <div className="slide-synergy-banner">
            <Zap size={20} className="text-emerald" />
            <div>
              <strong>Активировано синергий: {result.synergies.length}</strong>
              <span>
                {result.synergies.length > 0
                  ? 'Связки решений усилили друг друга и дали дополнительный прирост показателей без доп. затрат.'
                  : 'План автономен и минимизирует взаимные риски между ведомствами.'}
              </span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'slide-3',
      title: 'Слайд 3: Радарный баланс и трансформация районов',
      content: (
        <div className="slide-body">
          <div className="slide-tag">АНАЛИТИКА И РАДАР</div>
          <h2>Гармоничный рост по всем 5 сферам</h2>
          <p className="slide-subtitle">
            Ликвидация дисбалансов между левым и правым берегом
          </p>

          <div className="slide-analytics-row">
            <div className="slide-radar-wrap">
              <h4>Радарный профиль Астаны (До vs После):</h4>
              <ResponsiveContainer width="100%" height={250}>
                <RadarChart cx="50%" cy="50%" outerRadius="75%" data={domainData}>
                  <PolarGrid stroke="#cbd5e1" />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: '#1e293b', fontSize: 11, fontWeight: 600 }} />
                  <PolarRadiusAxis domain={[0, 100]} angle={30} tick={false} />
                  <Radar name="До" dataKey="Базовый" stroke="#94a3b8" fill="#94a3b8" fillOpacity={0.25} />
                  <Radar name="После" dataKey="После мер" stroke="#059669" fill="#10b981" fillOpacity={0.5} />
                </RadarChart>
              </ResponsiveContainer>
            </div>

            <div className="slide-districts-wrap">
              <h4>Трансформация районов столицы:</h4>
              <div className="slide-district-bars">
                {Object.entries(result.districts).map(([dName, data]) => (
                  <div key={dName} className="slide-d-bar-row">
                    <span className="d-name">{dName}</span>
                    <div className="d-bar-track">
                      <div className="d-bar-fill before" style={{ width: `${data.score.before}%` }} />
                      <div className="d-bar-fill after" style={{ width: `${data.score.after}%` }} />
                    </div>
                    <div className="d-bar-vals">
                      <span>{format(data.score.before, 1)}</span>
                      <span>→</span>
                      <strong>{format(data.score.after, 1)}</strong>
                      <Delta value={data.score.delta} />
                    </div>
                  </div>
                ))}
              </div>

              <div className="crit-status-pill">
                <CheckCircle size={16} className="text-emerald" />
                <span>
                  {result.critical.after === 0
                    ? 'Все критические зоны столицы (ниже 40 баллов) полностью устранены!'
                    : `Осталось критических зон: ${result.critical.after}`}
                </span>
              </div>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: 'slide-4',
      title: 'Слайд 4: AI-верификация и вердикт для Акимата',
      content: (
        <div className="slide-body">
          <div className="slide-tag">ЗАКЛЮЧЕНИЕ ЭКСПЕРТА</div>
          <h2>Обоснование решения перед комиссией</h2>
          <p className="slide-subtitle">
            Анализ устойчивости, сильных сторон и компромиссов от AI Supervisor
          </p>

          <div className="slide-ai-quote">
            <Sparkles size={24} className="text-emerald" />
            <div className="ai-quote-text">
              {analysis?.explanation ? (
                <div className="pitch-ai-text">{analysis.explanation}</div>
              ) : (
                <p>
                  Стратегия обеспечивает устойчивый рост индекса качества жизни с {format(result.score.before, 1)} до {format(result.score.after, 1)} баллов (+{format(result.score.delta, 1)}).
                  Основной драйвер роста — концентрация инвестиций на узких местах социальной инфраструктуры и безопасности, при сохранении сбалансированного бюджета ({result.budget.used}/100 ед.).
                </p>
              )}
            </div>
          </div>

          <div className="slide-takeaways-grid">
            <div className="takeaway-card">
              <strong>Сильная сторона:</strong>
              <p>Опережающее закрытие дефицита социальных объектов без создания кассового разрыва.</p>
            </div>
            <div className="takeaway-card">
              <strong>Управляемый компромисс:</strong>
              <p>Отложенный эффект инфраструктурных проектов компенсируется быстрыми цифровыми решениями.</p>
            </div>
            <div className="takeaway-card">
              <strong>Рекомендация Акиму:</strong>
              <p>Утвердить портфель решений к реализации в целевом периоде {context.horizon} кварталов.</p>
            </div>
          </div>
        </div>
      ),
    },
  ]

  const nextSlide = () => setCurrentSlide(s => Math.min(slides.length - 1, s + 1))
  const prevSlide = () => setCurrentSlide(s => Math.max(0, s - 1))

  return (
    <div className="page-enter pitch-deck-view">
      {/* Top action bar */}
      <div className="page-heading no-print">
        <div>
          <div className="eyebrow">ПРЕЗЕНТАЦИЯ ДЛЯ АКИМА И ЖЮРИ ХАКАТОНА</div>
          <h1>Доклад по стратегии развития Астаны</h1>
          <p>Автоматически сформированный питч-дек команды для 5-минутной защиты перед комиссией.</p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => go('results')}>
            <ArrowLeft size={16} /> Назад к результатам
          </button>
          <button className="button primary" onClick={() => window.print()}>
            <Printer size={16} /> Распечатать / Экспорт в PDF
          </button>
        </div>
      </div>

      {/* Slide frame */}
      <div className="pitch-slide-container panel">
        {slides[currentSlide].content}

        {/* Slide navigation controls */}
        <div className="slide-controls no-print">
          <button
            className="icon-button"
            onClick={prevSlide}
            disabled={currentSlide === 0}
            aria-label="Предыдущий слайд"
          >
            <ChevronLeft size={22} />
          </button>

          <div className="slide-pills">
            {slides.map((s, idx) => (
              <button
                key={s.id}
                className={`slide-pill ${currentSlide === idx ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
                aria-label={`Слайд ${idx + 1}`}
              >
                <span>{idx + 1}</span>
              </button>
            ))}
          </div>

          <button
            className="icon-button"
            onClick={nextSlide}
            disabled={currentSlide === slides.length - 1}
            aria-label="Следующий слайд"
          >
            <ChevronRight size={22} />
          </button>
        </div>
      </div>

      {/* Printable version containing all slides sequentially for window.print() */}
      <div className="printable-slides-all">
        {slides.map(s => (
          <div key={s.id} className="print-slide-page">
            {s.content}
          </div>
        ))}
      </div>
    </div>
  )
}

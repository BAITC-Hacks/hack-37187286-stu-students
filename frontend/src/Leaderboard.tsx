import { useState, useEffect } from 'react'
import {
  ArrowUpRight,
  Check,
  GitCompareArrows,
  Plus,
  RotateCcw,
  Trophy,
} from 'lucide-react'
import { errorText, format, request } from './api'
import { Delta, ErrorNotice, Loading, PanelTitle } from './components'
import type { CityContext, Comparison, Page, Simulation, TeamEntry } from './types'

// Default pre-computed reference teams
const DEFAULT_TEAMS: TeamEntry[] = [
  {
    id: 'team-ref-1',
    teamName: 'Команда «Урбанисты Столицы»',
    strategyName: 'Сбалансированное развитие Нуры',
    timestamp: Date.now() - 3600000 * 4,
    decisions: [
      { measure_id: 'M7', district: 'Нура' },
      { measure_id: 'M8', district: 'Нура' },
      { measure_id: 'M10', district: 'Нура' },
      { measure_id: 'M12', district: null },
      { measure_id: 'M5', district: 'Сарыарка' },
    ],
    score: 56.54,
    scoreDelta: 9.87,
    budgetUsed: 90,
    criticalRemaining: 0,
    synergiesCount: 2,
  },
  {
    id: 'team-ref-2',
    teamName: 'Команда «Эко-Астана»',
    strategyName: 'Чистый воздух и зеленый пояс',
    timestamp: Date.now() - 3600000 * 8,
    decisions: [
      { measure_id: 'M4', district: 'Сарыарка' },
      { measure_id: 'M5', district: 'Сарыарка' },
      { measure_id: 'M6', district: null },
      { measure_id: 'M9', district: 'Нура' },
      { measure_id: 'M10', district: 'Алматы' },
    ],
    score: 53.40,
    scoreDelta: 6.73,
    budgetUsed: 80,
    criticalRemaining: 1,
    synergiesCount: 1,
  },
  {
    id: 'team-ref-3',
    teamName: 'Команда «Технократы & Мобильность»',
    strategyName: 'Инфраструктура и скоростной транспорт',
    timestamp: Date.now() - 3600000 * 12,
    decisions: [
      { measure_id: 'M2', district: null },
      { measure_id: 'M3', district: 'Есиль' },
      { measure_id: 'M10', district: 'Сарыарка' },
      { measure_id: 'M11', district: 'Нура' },
      { measure_id: 'M12', district: null },
    ],
    score: 51.80,
    scoreDelta: 5.13,
    budgetUsed: 88,
    criticalRemaining: 2,
    synergiesCount: 1,
  },
]

export default function Leaderboard({
  context: _context,
  result,
  apply,
  go,
}: {
  context: CityContext
  result: Simulation | null
  apply: (result: Simulation) => void
  go: (page: Page) => void
}) {
  const [teams, setTeams] = useState<TeamEntry[]>(() => {
    try {
      const saved = localStorage.getItem('astana_teams_leaderboard')
      if (saved) return JSON.parse(saved)
    } catch {}
    return DEFAULT_TEAMS
  })

  const [newTeamName, setNewTeamName] = useState('')
  const [strategyTitle, setStrategyTitle] = useState('')
  const [savedSuccess, setSavedSuccess] = useState(false)

  // Comparison state
  const [comparingWith, setComparingWith] = useState<TeamEntry | null>(null)
  const [comparison, setComparison] = useState<Comparison | null>(null)
  const [compareLoading, setCompareLoading] = useState(false)
  const [compareError, setCompareError] = useState<string | null>(null)

  // Save to localStorage
  useEffect(() => {
    try {
      localStorage.setItem('astana_teams_leaderboard', JSON.stringify(teams))
    } catch {}
  }, [teams])

  const saveCurrentStrategy = () => {
    if (!result) return
    const teamName = newTeamName.trim() || `Команда №${teams.length + 1}`
    const stratName = strategyTitle.trim() || 'Стратегия развития Астаны'

    const newEntry: TeamEntry = {
      id: `team-${Date.now()}`,
      teamName,
      strategyName: stratName,
      timestamp: Date.now(),
      decisions: result.decisions,
      score: result.score.after,
      scoreDelta: result.score.delta,
      budgetUsed: result.budget.used,
      criticalRemaining: result.critical.after,
      synergiesCount: result.synergies.length,
    }

    setTeams(prev => [newEntry, ...prev])
    setNewTeamName('')
    setStrategyTitle('')
    setSavedSuccess(true)
    setTimeout(() => setSavedSuccess(false), 3000)
  }

  const runComparison = async (team: TeamEntry) => {
    if (!result) return
    setComparingWith(team)
    setCompareLoading(true)
    setCompareError(null)
    setComparison(null)

    try {
      const data = await request<Comparison>('/compare', {
        scenario_a: team.decisions,
        scenario_b: result.decisions,
      })
      setComparison(data)
    } catch (e) {
      setCompareError(errorText(e))
    } finally {
      setCompareLoading(false)
    }
  }

  const [loadError, setLoadError] = useState<string | null>(null)

  const loadTeamDecisions = async (team: TeamEntry) => {
    setLoadError(null)
    try {
      const simulated = await request<Simulation>('/simulate', { decisions: team.decisions })
      if (simulated && simulated.valid) {
        apply(simulated)
      }
    } catch (e) {
      setLoadError(errorText(e))
    }
  }

  // Sorted teams by score
  const sortedTeams = [...teams].sort((a, b) => b.score - a.score)

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">БЕНЧМАРКИНГ СЦЕНАРИЕВ · МУЛЬТИ-КОМАНДНЫЙ РЕЙТИНГ</div>
          <h1>Сравнение результатов команд хакатона</h1>
          <p>
            Все команды начинают с одинакового стартового бюджета 100 ед. и единого датасета столицы. Оцените, чей портфель решений оказался наиболее эффективным.
          </p>
        </div>
        <div className="heading-actions">
          <button className="button secondary" onClick={() => go('builder')}>
            <RotateCcw size={16} /> Собрать новый вариант
          </button>
        </div>
      </div>

      {/* Save current result form */}
      {result && (
        <section className="panel save-team-panel">
          <div className="flex-between">
            <div>
              <span className="eyebrow">ВАШ ТЕКУЩИЙ РАСЧЁТ</span>
              <h3>Зафиксировать результат команды в рейтинге</h3>
            </div>
            <div className="current-quick-stats">
              <span>Score: <strong>{format(result.score.after, 1)}</strong></span>
              <span>Бюджет: <strong>{result.budget.used}/100</strong></span>
              <span>Синергии: <strong>{result.synergies.length}</strong></span>
            </div>
          </div>

          <div className="save-team-form">
            <input
              id="leaderboard-team-name"
              name="teamName"
              type="text"
              className="input"
              aria-label="Название вашей команды"
              placeholder="Название вашей команды (напр., Smart City Astana)"
              value={newTeamName}
              onChange={e => setNewTeamName(e.target.value)}
              autoComplete="organization"
            />
            <input
              id="leaderboard-strategy-title"
              name="strategyTitle"
              type="text"
              className="input"
              aria-label="Краткое название стратегии"
              placeholder="Краткое название стратегии (напр., Социальный рывок)"
              value={strategyTitle}
              onChange={e => setStrategyTitle(e.target.value)}
              autoComplete="off"
            />
            <button className="button primary" onClick={saveCurrentStrategy}>
              <Plus size={16} /> Сохранить в лидерборд
            </button>
          </div>
          {savedSuccess && <div className="saved-success-msg"><Check size={16} /> Результат успешно добавлен в таблицу!</div>}
        </section>
      )}

      {loadError && <ErrorNotice message={loadError} />}

      {/* Leaderboard Table */}
      <section className="panel">
        <PanelTitle
          eyebrow="РЕЙТИНГ СТРАТЕГИЙ"
          title="Сводная таблица команд"
          right={<span className="badge success"><Trophy size={14} /> {sortedTeams.length} команд</span>}
        />

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Место</th>
                <th>Команда и стратегия</th>
                <th>AQLS Score</th>
                <th>Прирост Δ</th>
                <th>Бюджет</th>
                <th>Критические</th>
                <th>Синергии</th>
                <th>Действия</th>
              </tr>
            </thead>
            <tbody>
              {sortedTeams.map((team, idx) => {
                const isUserCurrent = result && JSON.stringify(result.decisions) === JSON.stringify(team.decisions)
                return (
                  <tr key={team.id} className={isUserCurrent ? 'highlight-row' : ''}>
                    <td>
                      <span className={`rank-badge ${idx === 0 ? 'gold' : idx === 1 ? 'silver' : idx === 2 ? 'bronze' : ''}`}>
                        {idx + 1}
                      </span>
                    </td>
                    <td>
                      <strong>{team.teamName}</strong>
                      <small className="team-strategy-sub">{team.strategyName}</small>
                    </td>
                    <td>
                      <strong className="score-cell">{format(team.score, 1)}</strong>
                    </td>
                    <td>
                      <Delta value={team.scoreDelta} />
                    </td>
                    <td>
                      <span>{team.budgetUsed} / 100 ед.</span>
                    </td>
                    <td>
                      <span className={team.criticalRemaining === 0 ? 'text-green' : 'text-amber'}>
                        {team.criticalRemaining === 0 ? '0 (Устранены)' : `${team.criticalRemaining} зон`}
                      </span>
                    </td>
                    <td>
                      <span className="synergy-count">{team.synergiesCount}</span>
                    </td>
                    <td>
                      <div className="row-actions">
                        {result && !isUserCurrent && (
                          <button
                            className="button secondary compact-btn"
                            onClick={() => runComparison(team)}
                            title="Сравнить эту команду с вашей текущей"
                          >
                            <GitCompareArrows size={14} /> Сравнить
                          </button>
                        )}
                        <button
                          className="button secondary compact-btn"
                          onClick={() => loadTeamDecisions(team)}
                          title="Загрузить стратегию этой команды"
                        >
                          Загрузить <ArrowUpRight size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Side-by-Side Comparison Modal / Box */}
      {comparingWith && (
        <section className="panel comparison-drilldown">
          <div className="flex-between">
            <PanelTitle
              eyebrow="ПРЯМОЕ СРАВНЕНИЕ КОМАНД"
              title={`Ваша команда VS ${comparingWith.teamName}`}
              right={<GitCompareArrows size={20} />}
            />
            <button className="text-button" onClick={() => setComparingWith(null)}>
              Закрыть сравнение ×
            </button>
          </div>

          {compareLoading ? (
            <Loading>Симулятор выполняет сравнительный расчёт через /api/compare…</Loading>
          ) : compareError ? (
            <ErrorNotice message={compareError} />
          ) : comparison?.valid ? (
            <div className="comparison-arena">
              <div className="comparison-columns">
                <div className="comp-col">
                  <span className="col-label">{comparingWith.teamName}</span>
                  <strong className="comp-big-score">{format(comparison.score.a, 1)}</strong>
                  <span className="muted small">Бюджет: {comparison.budget.a} ед.</span>
                  <span className="muted small">Критических: {comparison.critical.count_a}</span>
                </div>

                <div className="comp-delta-center">
                  <span>Разница (Вы − Они)</span>
                  <Delta value={comparison.score.delta} />
                  <small className="muted">
                    {comparison.score.delta > 0
                      ? 'Ваша стратегия даёт больший прирост качества жизни!'
                      : 'Стратегия соперника эффективнее по AQLS.'}
                  </small>
                </div>

                <div className="comp-col my-col">
                  <span className="col-label">Ваша текущая стратегия</span>
                  <strong className="comp-big-score text-emerald">{format(comparison.score.b, 1)}</strong>
                  <span className="muted small">Бюджет: {comparison.budget.b} ед.</span>
                  <span className="muted small">Критических: {comparison.critical.count_b}</span>
                </div>
              </div>

              {/* District comparison table */}
              <div className="comp-districts-grid">
                <h4>Сравнение по 5 районам Астаны:</h4>
                <div className="comp-districts-list">
                  {Object.entries(comparison.districts).map(([dName, data]) => (
                    <div key={dName} className="district-comp-card">
                      <strong>{dName}</strong>
                      <div className="comp-vals">
                        <span>{format(data.a, 1)}</span>
                        <span>→</span>
                        <strong>{format(data.b, 1)}</strong>
                      </div>
                      <Delta value={data.delta} />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </section>
      )}
    </div>
  )
}

import { useRef, useState } from 'react'
import { ArrowRight, ChevronDown, CircleHelp, Compass, MapPin, Send, SlidersHorizontal, Sparkles, Target } from 'lucide-react'
import { errorText, request } from './api'
import { ErrorNotice, Loading, PanelTitle, ScenarioCard } from './components'
import type { AgentResponse, ChatMessage, CityContext, Decision, Objective, SearchResult, Simulation } from './types'

const objectives: { value: Objective; label: string; description: string }[] = [
  { value: 'max_score', label: 'Максимальный Score', description: 'Наибольшая итоговая оценка качества жизни города.' },
  { value: 'balanced', label: 'Баланс районов', description: 'Приоритет улучшению самого слабого района.' },
  { value: 'focus_district', label: 'Поддержка района', description: 'Максимальная оценка выбранного района.' },
  { value: 'budget_efficiency', label: 'Эффективный бюджет', description: 'Прирост качества жизни на единицу затрат.' },
]

function evidenceScenarios(response: AgentResponse): Simulation[] {
  const found: Simulation[] = []
  const seen = new Set<string>()
  for (const evidence of response.evidence ?? []) {
    const result = evidence.result as { results?: Simulation[]; valid?: boolean; decisions?: Decision[]; score?: unknown } | null
    const candidates = result?.results ?? (result?.valid && result?.decisions && result?.score ? [result as Simulation] : [])
    for (const candidate of candidates) {
      if (!candidate.valid || !candidate.decisions || !candidate.score) continue
      const key = JSON.stringify(candidate.decisions)
      if (!seen.has(key)) { found.push(candidate); seen.add(key) }
    }
  }
  return found
}

export default function Advisor({ context, decisions, previous, apply }: {
  context: CityContext; decisions: Decision[]; previous: Simulation | null; apply: (result: Simulation) => void
}) {
  const [objective, setObjective] = useState<Objective>('max_score')
  const [budget, setBudget] = useState(String(context.budget))
  const [focus, setFocus] = useState(context.baseline.weakest_district)
  const [searching, setSearching] = useState(false)
  const [search, setSearch] = useState<SearchResult | null>(null)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [searchLabel, setSearchLabel] = useState('')
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [message, setMessage] = useState('')
  const [chatting, setChatting] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [lastMessage, setLastMessage] = useState('')
  const threadEnd = useRef<HTMLDivElement>(null)

  async function searchScenarios() {
    setSearching(true); setSearchError(null); setSearch(null)
    setSearchLabel(`${objectives.find(o => o.value === objective)?.label} · бюджет до ${budget}`)
    try {
      const response = await request<SearchResult>('/search', { objective, budget_limit: Number(budget), focus_district: objective === 'focus_district' ? focus : null, top_k: 3 })
      if (response.valid === false) throw new Error(response.errors?.map(e => typeof e === 'string' ? e : e.message).join(' ') || response.message || 'Не удалось выполнить поиск.')
      setSearch(response)
    } catch (e) { setSearchError(errorText(e)) }
    finally { setSearching(false) }
  }

  async function send(text: string, retry = false) {
    if (!text.trim() || chatting) return
    const history = retry ? messages.slice(0, -1) : messages
    if (!retry) setMessages(current => [...current, { role: 'user', content: text }])
    setMessage(''); setChatting(true); setChatError(null); setLastMessage(text)
    try {
      const response = await request<AgentResponse>('/chat', {
        message: text,
        decisions: decisions.length ? decisions : null,
        previous_decisions: previous?.decisions ?? null,
        history: history.slice(-12).map(({ role, content }) => ({ role, content })),
      })
      setMessages(current => [...current, { role: 'assistant', content: response.summary || response.message || 'Ответ получен.', response }])
    } catch (e) { setChatError(errorText(e)); setMessage(text) }
    finally { setChatting(false); window.setTimeout(() => threadEnd.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' }), 80) }
  }

  return (
    <div className="page-enter">
      <div className="page-heading">
        <div>
          <div className="eyebrow">AI Urban Strategy Copilot</div>
          <h1>Вместе найдём лучший путь</h1>
          <p>Обсудите цель с советником или исследуйте рассчитанные варианты.</p>
        </div>
        <span className="badge">
          <Target size={13} /> Решения с проверяемыми результатами
        </span>
      </div>

      <div className="advisor-layout">
        {/* Chat Panel */}
        <section className="panel conversation">
          <PanelTitle
            eyebrow="ДИАЛОГ О ГОРОДЕ"
            title="Ваш AI-советник"
            right={<div className="icon-tile green"><Sparkles size={21} /></div>}
          />

          <div className="conversation-context">
            <span className="green-dot" />
            {decisions.length
              ? `В контексте: текущий план · ${decisions.length} решений`
              : 'В контексте: исходное состояние города'}
            {previous && <span className="context-history">+ предыдущий план</span>}
          </div>

          <div className="chat-thread" aria-live="polite">
            {/* Welcome screen */}
            {messages.length === 0 && (
              <div className="chat-welcome">
                <div className="welcome-orbit">
                  <Sparkles size={31} />
                </div>
                <h2>Каким вы видите город?</h2>
                <p>Советник подберёт инструменты, проверит сценарии и объяснит последствия решений.</p>
                <div className="prompt-examples">
                  {[
                    'Найди лучший сценарий до бюджета 90',
                    'Как лучше улучшить Нуру?',
                    'Предложи более сбалансированный вариант',
                    'Почему мой сценарий получил такой Score?',
                  ].map(prompt => (
                    <button
                      key={prompt}
                      onClick={() => {
                        setMessage(prompt)
                        document.getElementById('advisor-message')?.focus()
                      }}
                    >
                      {prompt}
                      <ArrowRight size={14} />
                    </button>
                  ))}
                </div>
                <p className="small muted">
                  Для диалога требуется подключённая LLM.<br />
                  Поиск справа работает и без неё.
                </p>
              </div>
            )}

            {/* Message thread */}
            {messages.map((item, i) => (
              <div key={i} className={`chat-message ${item.role}`}>
                <div className="message-author">
                  {item.role === 'user' ? 'Вы' : <><Sparkles size={13} /> AI-советник</>}
                </div>

                {item.response && !item.response.available ? (
                  <div className="unavailable-message">
                    <strong>AI-советник сейчас недоступен</strong>
                    <p>{item.response.message || item.content}</p>
                    <p>Вы можете найти рассчитанные варианты через форму поиска.</p>
                  </div>
                ) : (
                  <p className="message-content">{item.content}</p>
                )}

                {item.response?.available && (
                  <>
                    {([
                      { key: 'observations', label: 'Наблюдения' },
                      { key: 'calculated_results', label: 'Результаты расчёта' },
                      { key: 'interpretation', label: 'Интерпретация' },
                      { key: 'strengths', label: 'Сильные стороны' },
                      { key: 'risks', label: 'Риски' },
                      { key: 'tradeoffs', label: 'Компромиссы' },
                      { key: 'recommendations', label: 'Рекомендации' },
                    ] as const).map(({ key, label }) =>
                      item.response?.[key]?.length ? (
                        <div className="response-section" key={key}>
                          <strong>{label}</strong>
                          <ul>
                            {item.response[key]!.map((text, j) => (
                              <li key={j}>{text}</li>
                            ))}
                          </ul>
                        </div>
                      ) : null
                    )}
                  </>
                )}

                {item.response && evidenceScenarios(item.response).length > 0 && (
                  <div className="evidence-scenarios">
                    {evidenceScenarios(item.response).map((scenario, j) => (
                      <ScenarioCard
                        key={j}
                        result={scenario}
                        context={context}
                        index={j}
                        apply={apply}
                      />
                    ))}
                  </div>
                )}

                {!!item.response?.evidence?.length && (
                  <details className="evidence-details">
                    <summary>
                      Основания ответа · {item.response.evidence.length} вызовов{' '}
                      <ChevronDown size={14} />
                    </summary>
                    {item.response.evidence.map((evidence, j) => (
                      <div key={j}>
                        <strong>{evidence.tool}</strong>
                        <pre>
                          {JSON.stringify(
                            { arguments: evidence.args, result: evidence.result },
                            null,
                            2
                          )}
                        </pre>
                      </div>
                    ))}
                  </details>
                )}
              </div>
            ))}

            {chatting && <Loading>Советник проверяет данные и варианты…</Loading>}
            {chatError && <ErrorNotice message={chatError} retry={() => send(lastMessage, true)} />}
            <div ref={threadEnd} />
          </div>

          {/* Compose bar */}
          <form className="chat-compose" onSubmit={e => { e.preventDefault(); void send(message) }}>
            <label className="sr-only" htmlFor="advisor-message">
              Ваша цель или вопрос советнику
            </label>
            <textarea
              id="advisor-message"
              name="advisorMessage"
              value={message}
              maxLength={4000}
              placeholder="Например: улучшить Нуру, бюджет до 90…"
              onChange={e => setMessage(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(message)
                }
              }}
              rows={2}
            />
            <button
              className="send-button"
              type="submit"
              aria-label="Отправить советнику"
              disabled={chatting || !message.trim()}
            >
              <Send size={18} />
            </button>
          </form>

          <p className="chat-footnote">
            <CircleHelp size={12} />
            Числовые выводы основаны на расчётах модели города.
          </p>
        </section>

        {/* Search Panel */}
        <aside className="panel search-panel">
          <PanelTitle
            eyebrow="ПОИСК ВАРИАНТОВ"
            title="От цели к стратегии"
            right={<SlidersHorizontal size={20} />}
          />
          <p className="muted small">
            Выберите приоритет. Найдём допустимые планы и рассчитаем каждый.
          </p>

          <form onSubmit={e => { e.preventDefault(); void searchScenarios() }}>
            <fieldset className="objective-options">
              <legend>Что для вас важнее?</legend>
              {objectives.map(item => (
                <label
                  htmlFor={`advisor-objective-${item.value}`}
                  className={`objective-option ${objective === item.value ? 'active' : ''}`}
                  key={item.value}
                >
                  <input
                    id={`advisor-objective-${item.value}`}
                    type="radio"
                    name="objective"
                    value={item.value}
                    checked={objective === item.value}
                    onChange={() => setObjective(item.value)}
                  />
                  <span>
                    <strong>{item.label}</strong>
                    <small>{item.description}</small>
                  </span>
                </label>
              ))}
            </fieldset>

            <div className="form-group">
              <label htmlFor="budget-limit">Бюджет, не более</label>
              <div className="budget-input">
                <input
                  id="budget-limit"
                  name="budgetLimit"
                  type="number"
                  min="0"
                  max={context.budget}
                  step="1"
                  value={budget}
                  onChange={e => setBudget(e.target.value)}
                  required
                />
                <span>ед. из {context.budget}</span>
              </div>
            </div>

            {objective === 'focus_district' && (
              <div className="form-group district-focus-group">
                <div className="flex-between" style={{ marginBottom: 8 }}>
                  <label htmlFor="focus-district" style={{ margin: 0, fontWeight: 600 }}>Приоритетный район:</label>
                  <label className="select-field has-district compact-select">
                    <MapPin size={13} />
                    <select
                      className="input full"
                      id="focus-district"
                      name="focusDistrict"
                      aria-label="Приоритетный район"
                      value={focus}
                      onChange={e => setFocus(e.target.value)}
                    >
                      {context.districts.map(d => (
                        <option key={d.name}>{d.name}</option>
                      ))}
                    </select>
                    <ChevronDown size={13} />
                  </label>
                </div>

                <div className="district-pills-row" aria-label="Выбор приоритетного района">
                  {context.districts.map(d => {
                    const isActive = focus === d.name
                    return (
                      <button
                        key={d.name}
                        type="button"
                        className={`district-pill-btn ${isActive ? 'active' : ''}`}
                        onClick={() => setFocus(d.name)}
                      >
                        {d.name}
                      </button>
                    )
                  })}
                </div>
              </div>
            )}

            <button className="button primary full" disabled={searching} type="submit">
              {searching ? 'Ищем варианты…' : 'Найти сценарии'}
              <Compass size={17} />
            </button>
          </form>

          <div className="search-footnote">
            <CheckCircle />
            <span>
              Перебор допустимых сценариев.<br />
              Работает без AI-подключения.
            </span>
          </div>
        </aside>
      </div>

      {/* Search Results */}
      {(searching || search || searchError) && (
        <section className="search-results" aria-live="polite">
          <div className="page-heading small-heading">
            <div>
              <div className="eyebrow">РЕЗУЛЬТАТЫ ПОИСКА</div>
              <h2>{searchLabel}</h2>
            </div>
            {search?.search && (
              <span className="badge">
                {search.search.valid_candidates.toLocaleString('ru-RU')} допустимых вариантов
              </span>
            )}
          </div>

          {searching && (
            <div className="panel">
              <Loading>Проверяем сочетания и размещение мероприятий…</Loading>
            </div>
          )}

          {searchError && <ErrorNotice message={searchError} retry={searchScenarios} />}

          {search && (search.results?.length ?? 0) === 0 && (
            <div className="notice">
              <CircleHelp size={19} />
              <p>
                {search.message ||
                  'Для этих ограничений допустимые сценарии не найдены. Попробуйте увеличить бюджет.'}
              </p>
            </div>
          )}

          {search && (
            <div className="scenario-grid">
              {(search.results ?? []).map((scenario, i) => (
                <ScenarioCard
                  key={i}
                  result={scenario}
                  context={context}
                  index={i}
                  apply={apply}
                />
              ))}
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function CheckCircle() {
  return <span className="green-dot" />
}

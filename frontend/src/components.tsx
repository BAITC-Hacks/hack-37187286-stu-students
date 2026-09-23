import type { ReactNode } from 'react'
import { AlertCircle, ArrowUpRight, Building2, Check, CircleHelp, Leaf, LoaderCircle, ShieldCheck, TramFront, Users, Wrench } from 'lucide-react'
import { format, signed } from './api'
import type { CityContext, Simulation } from './types'

export const directionIcon = (direction: string, size = 19) => {
  const Icon = /транспорт/i.test(direction) ? TramFront : /эколог/i.test(direction) ? Leaf
    : /соци/i.test(direction) ? Users : /безопас/i.test(direction) ? ShieldCheck : Wrench
  return <Icon size={size} strokeWidth={1.8} />
}
export const directionClass = (direction: string) => /транспорт/i.test(direction) ? 'blue' : /эколог/i.test(direction) ? 'green'
  : /соци/i.test(direction) ? 'purple' : /безопас/i.test(direction) ? 'amber' : 'slate'

export function Loading({ children = 'Загружаем данные…' }: { children?: ReactNode }) {
  return <div className="loading" role="status"><LoaderCircle size={19} className="spin" />{children}</div>
}
export function ErrorNotice({ message, retry }: { message: string; retry?: () => void }) {
  return <div className="notice danger" role="alert"><AlertCircle size={19} /><div>{message}{retry && <button className="text-button" onClick={retry}>Повторить запрос <ArrowUpRight size={15} /></button>}</div></div>
}
export function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return <div className="empty panel"><div className="empty-icon"><Building2 size={29} /></div><h2>{title}</h2><p>{children}</p>{action}</div>
}
export function Stat({ label, value, caption, icon, tone = '', children }: {
  label: string; value: ReactNode; caption?: ReactNode; icon: ReactNode; tone?: string; children?: ReactNode
}) {
  return <div className={`stat-card ${tone}`}><div className="stat-label">{label}<span className="stat-icon">{icon}</span></div><div className="stat-value">{value}</div><div className="stat-caption">{caption}</div>{children}</div>
}
export function Delta({ value }: { value: number }) {
  return <span className={`delta ${value < 0 ? 'negative' : value === 0 ? 'neutral' : ''}`}>{value > 0 && <ArrowUpRight size={13} />}{signed(value)}</span>
}
export function PanelTitle({ eyebrow, title, right }: { eyebrow?: string; title: string; right?: ReactNode }) {
  return <div className="panel-title"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h2>{title}</h2></div>{right}</div>
}
export function ScenarioCard({ result, context, index, apply }: { result: Simulation; context: CityContext; index: number; apply: (result: Simulation) => void }) {
  return <article className="scenario-card"><div className="flex-between"><span className="eyebrow">Сценарий {String(index + 1).padStart(2, '0')}</span><span className="badge success"><Check size={12} /> Допустим</span></div><div className="scenario-score">{format(result.score.after)}<Delta value={result.score.delta} /></div><div className="small muted">Score · бюджет {result.budget.used} / {result.budget.total} · критических {result.critical.after}</div><ul className="scenario-decisions">{result.decisions.map(d => <li key={d.measure_id}><span>{d.measure_id}</span><div>{context.measures.find(m => m.id === d.measure_id)?.name}<small>{d.district ?? 'Весь город'}</small></div></li>)}</ul><button className="button secondary full" onClick={() => apply(result)}>Применить сценарий <ArrowUpRight size={16} /></button></article>
}
export function ModelNote() {
  return <div className="model-note"><CircleHelp size={15} /><span>Учебная модель HackAlem. Показатели синтетические и не отражают реальную статистику Астаны.</span></div>
}

export interface Decision { measure_id: string; district: string | null }
export interface Measure {
  id: string; name: string; direction: string; scope: 'district' | 'city'
  cost: number; lag: number; effects: Record<string, number>
}
export interface District { name: string; population_share: number; indicators: Record<string, number>; profile: string }
export interface CriticalIndicator { district: string; indicator: string; value: number }
export interface CityScore {
  score: number; average: number; minimum: number; weakest_district: string
  critical: CriticalIndicator[]; district_scores: Record<string, number>
}
export interface CityContext {
  districts: District[]
  indicators: Record<string, { name: string; direction: string; weight: number }>
  measures: Measure[]; budget: number; horizon: number; baseline: CityScore
  constraints: {
    decision_count: number; max_per_direction: number; critical_threshold: number
    incompatibilities: { measures: string[]; same_district_only: boolean; reason: string }[]
  }
  demo_plan: Decision[]
}
export interface Budget { total: number; used: number; remaining: number }
export interface Validation { valid: boolean; errors: { code: string; message: string }[]; budget: Budget }
export interface Change { before: number; after: number; delta: number }
export interface Simulation {
  valid: true; budget: Budget; score: Change
  critical: { before: number; after: number; remaining: CriticalIndicator[] }
  weakest_district: { before: string; after: string }
  districts: Record<string, { score: Change; indicators: Record<string, Change> }>
  indicator_changes: ({ district: string; indicator: string } & Change)[]
  measure_contributions: {
    measure_id: string; name: string; direction: string; district: string | null
    cost: number; lag: number; effect_share: number; effects_by_district: Record<string, Record<string, number>>
  }[]
  synergies: { measures: string[]; district: string; effects: Record<string, number> }[]
  decisions: Decision[]; before: CityScore; after: CityScore
  summary: string[]
}
export type Objective = 'max_score' | 'balanced' | 'focus_district' | 'budget_efficiency'
export interface SearchResult { valid?: boolean; errors?: (string | { message: string })[]; results?: Simulation[]; search?: { exhaustive: boolean; valid_candidates: number }; ranking?: string[]; objective?: string; message?: string }
export interface Comparison {
  valid: boolean; errors?: { code: string; message: string }[]
  score: { a: number; b: number; delta: number }
  budget: { a: number; b: number; delta: number }
  districts: Record<string, { a: number; b: number; delta: number }>
  critical: { a: CriticalIndicator[]; b: CriticalIndicator[]; count_a: number; count_b: number; delta: number }
  [key: string]: unknown
}
export interface AgentResponse {
  available: boolean; summary?: string; message?: string
  strengths?: string[]; risks?: string[]; tradeoffs?: string[]; recommendations?: string[]
  observations?: string[]; calculated_results?: string[]; interpretation?: string[]
  evidence?: { tool: string; args: Record<string, unknown>; result: unknown }[]
  score?: Change
}
export interface Analysis { available: boolean; explanation: string | null; message?: string }
export interface ChatMessage { role: 'user' | 'assistant'; content: string; response?: AgentResponse }
export type Page = 'overview' | 'builder' | 'results' | 'advisor'

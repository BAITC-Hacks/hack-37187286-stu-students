export async function request<T>(path: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const timeoutMs = ['/chat', '/analyze'].includes(path) ? 90_000 : path === '/search' ? 60_000 : 15_000
  const timeout = AbortSignal.timeout(timeoutMs)
  try {
    const response = await fetch(`/api${path}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    const data = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = typeof data?.detail === 'string' ? data.detail : null
      const errors = Array.isArray(data?.errors) ? data.errors.map((e: string | { message: string }) => typeof e === 'string' ? e : e.message).join(' ') : null
      throw new Error(detail || errors || `Сервис вернул ошибку ${response.status}. Повторите запрос.`)
    }
    if (data === null) throw new Error('Сервис вернул пустой ответ. Повторите запрос.')
    return data as T
  } catch (error) {
    if (timeout.aborted && !signal?.aborted) throw new Error('Сервис не ответил вовремя. Попробуйте повторить запрос.')
    throw error
  }
}

export const format = (value: number | undefined, digits = 2) =>
  value === undefined ? '—' : value.toLocaleString('ru-RU', { minimumFractionDigits: digits, maximumFractionDigits: digits })
export const signed = (value: number) => `${value > 0 ? '+' : ''}${format(value)}`
export const errorText = (error: unknown) => error instanceof TypeError
  ? 'Не удалось связаться с сервером. Проверьте соединение и повторите запрос.'
  : error instanceof Error ? error.message : 'Не удалось выполнить запрос. Попробуйте ещё раз.'

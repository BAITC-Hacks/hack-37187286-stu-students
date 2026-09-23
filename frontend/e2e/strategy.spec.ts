import { expect, test } from '@playwright/test'

// The deterministic API must be running at 127.0.0.1:8000.
// Stub only external-model requests so this suite never spends provider credit.
test.beforeEach(async ({ page }) => {
  await page.route('**/api/analyze', route => route.fulfill({ json: {
    available: false, explanation: null, message: 'LLM не настроена. Расчёт доступен полностью.',
  } }))
})

test('manual demo, changed placement, prior comparison and stale-result invalidation', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const context = await (await request.get('http://127.0.0.1:8000/api/context')).json()
  const demo = await (await request.post('http://127.0.0.1:8000/api/simulate', { data: { decisions: context.demo_plan } })).json()
  const score = (value: number) => value.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Астана. Следующая глава.' })).toBeVisible()
  await expect(page.getByText('Учебная модель HackAlem.', { exact: false })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/overview-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Загрузить демо' }).click()
  const calculate = page.getByRole('button', { name: 'Рассчитать стратегию' })
  await expect(calculate).toBeEnabled()
  await calculate.click()
  await expect(page.getByTestId('result-score')).toHaveText(score(demo.score.after))
  await expect(page.getByRole('heading', { name: 'AI-объяснение недоступно' })).toBeVisible()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/results-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Изменить план' }).click()
  await page.getByLabel('Район для M1', { exact: true }).selectOption('Есиль')
  await page.getByRole('button', { name: 'Результаты', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Здесь появится результат вашей стратегии' })).toBeVisible()
  await page.getByRole('button', { name: 'Конструктор решений', exact: true }).click()
  await expect(calculate).toBeEnabled()
  await calculate.click()
  await expect(page.getByTestId('result-score')).not.toHaveText(score(demo.score.after))
  await page.getByRole('button', { name: 'Сравнить планы' }).click()
  await expect(page.getByText('Score A → B', { exact: true })).toBeVisible()
  await expect(page.getByText('Критические показатели', { exact: true }).last()).toBeVisible()
  expect(errors).toEqual([])
})

test('over-budget and global incompatibility stay invalid', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Загрузить демо' }).click()
  await page.getByRole('button', { name: 'Убрать M12', exact: true }).click()
  await page.getByRole('button', { name: 'Добавить M13', exact: true }).click()
  await page.getByLabel('Район для M13', { exact: true }).selectOption('Нура')
  await expect(page.locator('.validation-errors')).toContainText('109')
  await expect(page.getByRole('button', { name: 'Рассчитать стратегию' })).toBeDisabled()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/invalid-plan.png', fullPage: true })
  await page.getByRole('button', { name: 'Очистить выбор' }).click()
  await page.getByRole('button', { name: 'Добавить M1', exact: true }).click()
  await page.getByLabel('Район для M1', { exact: true }).selectOption('Нура')
  await page.getByRole('button', { name: 'Добавить M3', exact: true }).click()
  await page.getByLabel('Район для M3', { exact: true }).selectOption('Есиль')
  await expect(page.locator('.validation-errors')).toContainText('M1')
  await expect(page.locator('.validation-errors')).toContainText('M3')
  await expect(page.getByRole('button', { name: 'Рассчитать стратегию' })).toBeDisabled()
})

test('advisor unavailable is honest; real optimizer finds and applies a valid plan', async ({ page }) => {
  await page.route('**/api/chat', route => route.fulfill({ json: {
    available: false, summary: '', message: 'LLM не настроена. Используйте поиск сценариев.', evidence: [],
  } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'AI-советник', exact: true }).click()
  await page.getByLabel('Ваша цель или вопрос советнику').fill('Найди лучший сценарий до бюджета 90')
  await page.getByRole('button', { name: 'Отправить советнику' }).click()
  await expect(page.getByText('AI-советник сейчас недоступен', { exact: true })).toBeVisible()
  await page.getByLabel('Бюджет, не более').fill('90')
  const searchResponse = page.waitForResponse(response => response.url().endsWith('/api/search') && response.status() === 200)
  await page.getByRole('button', { name: 'Найти сценарии', exact: true }).click()
  await expect(page.locator('.search-results .scenario-card')).toHaveCount(3, { timeout: 60_000 })
  const searchResult = await (await searchResponse).json()
  const best = searchResult.results[0]
  expect(best.budget.used).toBeLessThanOrEqual(90)
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/advisor-desktop.png', fullPage: true })
  await page.getByRole('button', { name: 'Применить сценарий' }).first().click()
  await expect(page.getByTestId('result-score')).toBeVisible()
  await expect(page.locator('.result-stats .stat-card').first().locator('.stat-value')).toContainText(String(best.budget.used))
  await page.getByRole('button', { name: 'Обсудить с советником' }).click()
  await expect(page.getByText('AI-советник сейчас недоступен', { exact: true })).toBeVisible()
  await page.getByLabel('Поддержка района', { exact: false }).check()
  await page.getByLabel('Приоритетный район').selectOption('Нура')
  await page.getByRole('button', { name: 'Найти сценарии', exact: true }).click()
  await expect(page.locator('.search-results .scenario-card')).toHaveCount(3, { timeout: 60_000 })
  await page.getByLabel('Бюджет, не более').fill('1')
  await page.getByRole('button', { name: 'Найти сценарии', exact: true }).click()
  await expect(page.locator('.search-results .notice')).toBeVisible()
})

test('mobile navigation, keyboard selection and layout', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Астана. Следующая глава.' })).toBeVisible()
  await page.screenshot({ path: 'test-results/overview-mobile.png', fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.getByRole('button', { name: 'Открыть меню' }).click()
  await page.getByRole('button', { name: 'Конструктор решений', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Соберите свою стратегию' })).toBeVisible()
  await page.getByRole('button', { name: 'Загрузить демо' }).click()
  const calculate = page.getByRole('button', { name: 'Рассчитать стратегию' })
  await expect(calculate).toBeEnabled()
  await calculate.focus()
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('result-score')).toBeVisible()
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy()
  await page.evaluate(() => window.scrollTo(0, 0))
  await page.screenshot({ path: 'test-results/results-mobile.png', fullPage: true })
})

test('structured AI response shows evidence and applies the calculated scenario', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  const context = await (await request.get('http://127.0.0.1:8000/api/context')).json()
  const calculated = await (await request.post('http://127.0.0.1:8000/api/simulate', { data: { decisions: context.demo_plan } })).json()
  await page.route('**/api/chat', route => route.fulfill({ json: {
    available: true,
    summary: 'План проверен. Основной эффект сосредоточен в Нуре.',
    observations: ['В исходном состоянии Нура требует внимания.'],
    calculated_results: ['Расчёт выполнен инструментом симуляции.'],
    interpretation: ['Социальные мероприятия поддерживают слабый район.'],
    strengths: ['Социальные показатели улучшились.'],
    risks: ['Транспортные проблемы требуют отдельного решения.'],
    tradeoffs: ['Бюджет направлен прежде всего на социальную сферу.'],
    recommendations: ['Сравните этот план с альтернативным размещением.'],
    score: calculated.score,
    evidence: [{ id: 'e1', tool: 'simulate_scenario', args: { decisions: context.demo_plan }, result: calculated }],
  } }))
  await page.goto('/')
  await page.getByRole('button', { name: 'AI-советник', exact: true }).click()
  await page.getByLabel('Ваша цель или вопрос советнику').fill('Объясни сценарий')
  await page.getByRole('button', { name: 'Отправить советнику' }).click()
  await expect(page.getByText('План проверен. Основной эффект сосредоточен в Нуре.', { exact: true })).toBeVisible()
  await expect(page.getByText('В исходном состоянии Нура требует внимания.', { exact: true })).toBeVisible()
  await expect(page.getByText('Расчёт выполнен инструментом симуляции.', { exact: true })).toBeVisible()
  await expect(page.getByText('Социальные мероприятия поддерживают слабый район.', { exact: true })).toBeVisible()
  await expect(page.locator('.evidence-scenarios .scenario-card')).toHaveCount(1)
  await page.locator('.evidence-scenarios').getByRole('button', { name: 'Применить сценарий' }).click()
  await expect(page.getByTestId('result-score')).toHaveText(calculated.score.after.toLocaleString('ru-RU', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  expect(errors).toEqual([])
})

import { chromium } from '@playwright/test'

async function test() {
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })
  await page.waitForTimeout(2000)

  // Click on 'Есиль' in the district tabs list
  const esilTab = page.locator('.district-tab', { hasText: 'Есиль' })
  await esilTab.click()
  await page.waitForTimeout(1000)

  // Check which district is selected in aside.district-detail
  const heading = await page.locator('.district-detail h2').textContent()
  console.log('Selected district in inspector:', heading)

  // Check active tab
  const activeTab = await page.locator('.district-tab.active').textContent()
  console.log('Active tab text:', activeTab)

  // Test zoom in button
  const zoomInBtn = page.locator('button[title*="Увеличить"]')
  await zoomInBtn.click()
  await page.waitForTimeout(500)
  const zoomText = await page.locator('.gis-zoom-indicator').textContent()
  console.log('Zoom after clicking zoom in:', zoomText)

  // Test layer switch
  const select = page.locator('.map-layer-selector select')
  await select.selectOption('Транспорт')
  await page.waitForTimeout(1000)
  console.log('Selected layer Транспорт successfully!')

  await browser.close()
}

test().catch(e => {
  console.error(e)
  process.exit(1)
})

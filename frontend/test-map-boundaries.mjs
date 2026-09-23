import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.waitForTimeout(1000)
  // Scroll to map element
  const mapEl = page.locator('.gis-map-canvas')
  await mapEl.scrollIntoViewIfNeeded()
  await page.waitForTimeout(600)
  const panel = page.locator('.city-panel')
  await panel.screenshot({ path: 'map-panel-view.png' })

  // Click on Nura district tab
  await page.locator('.district-pill', { hasText: 'Нура' }).click()
  await page.waitForTimeout(600)
  await panel.screenshot({ path: 'new-map-nura-selected.png' })

  // Click on Saryarka
  await page.locator('.district-pill', { hasText: 'Сарыарка' }).click()
  await page.waitForTimeout(600)
  await panel.screenshot({ path: 'new-map-saryarka-selected.png' })

  await browser.close()
  console.log('Screenshots saved!')
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})

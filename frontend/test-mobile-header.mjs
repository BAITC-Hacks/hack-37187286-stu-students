import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 375, height: 667 } })

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })
  await page.screenshot({ path: 'header-mobile-375.png' })

  // Open mobile drawer
  await page.locator('.topbar-menu-toggle').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'header-mobile-menu-open.png' })

  // Close mobile drawer via close button
  await page.locator('.sidebar-close').click()
  await page.waitForTimeout(200)

  // Open profile on mobile
  await page.locator('.user-avatar-btn').click()
  await page.waitForTimeout(300)
  await page.screenshot({ path: 'header-mobile-profile-open.png' })

  await browser.close()
  console.log('Mobile screenshots captured successfully!')
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})

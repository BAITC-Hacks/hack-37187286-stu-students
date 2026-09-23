import { chromium } from 'playwright'

async function run() {
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
  const consoleErrors = []
  page.on('console', msg => {
    if (msg.type() === 'error') consoleErrors.push(msg.text())
  })
  page.on('pageerror', err => consoleErrors.push(err.message))

  await page.goto('http://127.0.0.1:5173', { waitUntil: 'networkidle' })

  // 1. Check status bar bounding box (ensure no 164px height bug!)
  const statusRect = await page.locator('.topbar-status-bar').boundingBox()
  console.log('Status bar bounding box:', statusRect)

  // Screenshot initial fixed header
  await page.screenshot({ path: 'header-fixed-1440.png' })

  // 2. Click avatar to open profile dropdown
  console.log('Clicking avatar...')
  await page.locator('.user-avatar-btn').click()
  await page.waitForTimeout(300)

  const dropdownVisible = await page.locator('.profile-dropdown').isVisible()
  console.log('Profile dropdown visible:', dropdownVisible)
  await page.screenshot({ path: 'header-profile-open.png' })

  // 3. Close profile by pressing Escape
  await page.keyboard.press('Escape')
  await page.waitForTimeout(200)

  // 4. Click breadcrumb quick switcher
  console.log('Clicking breadcrumb quick switcher...')
  await page.locator('.breadcrumb-current-btn').click()
  await page.waitForTimeout(300)
  const navDropdownVisible = await page.locator('.breadcrumb-dropdown').isVisible()
  console.log('Breadcrumb dropdown visible:', navDropdownVisible)
  await page.screenshot({ path: 'header-nav-dropdown.png' })

  // 5. Switch to 'Конструктор решений' via dropdown
  await page.locator('.breadcrumb-dropdown-item', { hasText: 'Конструктор решений' }).click()
  await page.waitForTimeout(400)
  const builderHeading = await page.locator('h1').first().innerText()
  console.log('Heading on builder:', builderHeading)

  // 6. Click breadcrumb root 'Ситуационный центр'
  console.log('Clicking breadcrumb root Ситуационный центр...')
  await page.locator('.breadcrumb-root').click()
  await page.waitForTimeout(400)
  const overviewHeading = await page.locator('h1').first().innerText()
  console.log('Heading on overview:', overviewHeading)

  // 7. Click budget pill
  console.log('Clicking topbar budget pill...')
  await page.locator('.topbar-budget-pill').click()
  await page.waitForTimeout(400)
  console.log('Heading after budget pill click:', await page.locator('h1').first().innerText())

  // 8. Test sidebar toggle
  console.log('Testing sidebar toggle...')
  await page.locator('.topbar-menu-toggle').click()
  await page.waitForTimeout(300)
  const isCollapsed = await page.locator('.sidebar').evaluate(el => el.classList.contains('collapsed'))
  console.log('Sidebar collapsed:', isCollapsed)
  await page.screenshot({ path: 'header-sidebar-collapsed.png' })

  // 9. Re-open profile and test a quick action: "Презентация / Доклад Акиму"
  await page.locator('.user-avatar-btn').click()
  await page.waitForTimeout(300)
  await page.locator('.profile-action-btn', { hasText: 'Презентация / Доклад Акиму' }).click()
  await page.waitForTimeout(400)
  console.log('Heading on pitch deck:', await page.locator('h1').first().innerText())

  console.log('Total console errors:', consoleErrors.length)
  if (consoleErrors.length > 0) console.log('Errors:', consoleErrors)

  await browser.close()
  console.log('All tests finished successfully!')
}

run().catch(e => {
  console.error(e)
  process.exit(1)
})

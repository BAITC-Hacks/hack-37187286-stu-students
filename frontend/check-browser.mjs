import { chromium } from '@playwright/test'

async function main() {
  console.log('Launching browser...')
  const browser = await chromium.launch({ channel: 'msedge', headless: true })
  const page = await browser.newPage()

  page.on('console', msg => {
    console.log(`[CONSOLE ${msg.type().toUpperCase()}] ${msg.text()}`)
  })

  page.on('pageerror', err => {
    console.log(`[PAGE ERROR] ${err.message}\n${err.stack}`)
  })

  page.on('requestfailed', req => {
    console.log(`[REQUEST FAILED] ${req.url()} - ${req.failure()?.errorText}`)
  })

  console.log('Navigating to http://127.0.0.1:5173/ ...')
  await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' })

  console.log('Waiting 3 seconds for map to settle...')
  await page.waitForTimeout(3000)

  await page.screenshot({ path: 'map-debug.png', fullPage: true })
  console.log('Screenshot saved to map-debug.png')

  await browser.close()
}

main().catch(e => {
  console.error('Fatal error:', e)
  process.exit(1)
})

import { chromium } from 'playwright'

async function run() {
  console.log('Testing test-arcgis.html in browser...')
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  page.on('console', msg => console.log('PAGE LOG:', msg.type(), msg.text()))
  try {
    await page.goto('http://127.0.0.1:5173/test-arcgis.html', { waitUntil: 'domcontentloaded' })
    await page.waitForTimeout(8000)
    await page.screenshot({ path: 'arcgis-jsapi-view.png' })
    console.log('Saved arcgis-jsapi-view.png')
  } catch (err) {
    console.error('Error:', err)
  } finally {
    await browser.close()
  }
}

run()

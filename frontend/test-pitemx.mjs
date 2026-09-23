import { chromium } from 'playwright'

async function run() {
  console.log('Launching browser to test ArcGIS 3D scene...')
  const browser = await chromium.launch({ channel: 'msedge' })
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  try {
    const res = await page.goto('https://gis.esaulet.kz/portal/home/webscene/viewer.html?webscene=b535181687714acb87d95950844aed6a', {
      waitUntil: 'load',
      timeout: 30000
    })
    console.log('Page loaded, status:', res?.status())
    await page.waitForTimeout(6000) // Wait for WebGL scene to load
    await page.screenshot({ path: 'arcgis-webscene-view.png' })
    console.log('Saved arcgis-webscene-view.png')
  } catch (err) {
    console.error('Error loading scene:', err)
  } finally {
    await browser.close()
  }
}

run()

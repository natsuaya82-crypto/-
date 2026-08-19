/**
 * Phase 0 の実機相当の動作確認。
 *
 * 実際にブラウザでページを開き、iOS が送ってくる形の DeviceMotionEvent を合成して流し込み、
 * 4 姿勢が正しく判定されるかを HUD の表示で確かめる。スクリーンショットも保存する。
 *
 * 実行: node tools/verify-phase0.mjs
 */
import { chromium, devices } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'vite'

const SHOT_DIR = 'artifacts/phase0'
const GRAVITY = 9.81

// iOS の accelerationIncludingGravity は「下向き」をそのまま返す。
// 端末を立てて持つと (0, -9.8, 0)。
const CASES = [
  { label: 'portrait', gravity: { x: 0, y: -GRAVITY, z: 0 }, expected: 'Portrait' },
  { label: 'landscape-left', gravity: { x: -GRAVITY, y: 0, z: 0 }, expected: 'Landscape Left' },
  { label: 'portrait-upside-down', gravity: { x: 0, y: GRAVITY, z: 0 }, expected: 'Portrait Upside Down' },
  { label: 'landscape-right', gravity: { x: GRAVITY, y: 0, z: 0 }, expected: 'Landscape Right' },
  { label: 'flat-on-table', gravity: { x: 0, y: 0, z: -GRAVITY }, expected: 'Landscape Right' },
  // 90度ずつではなく、真逆へ一気に飛ばす。補間の回転軸が定まらないケース。
  { label: 'back-to-portrait', gravity: { x: 0, y: -GRAVITY, z: 0 }, expected: 'Portrait' },
  { label: 'flip-180', gravity: { x: 0, y: GRAVITY, z: 0 }, expected: 'Portrait Upside Down' },
]

/** ページ側で devicemotion を発火し続ける。実機のイベント間隔に近づけて 60Hz。 */
function startMotionFeed(page) {
  return page.evaluate(() => {
    window.__gravity = { x: 0, y: -9.81, z: 0 }
    window.__motionTimer = setInterval(() => {
      const event = new Event('devicemotion')
      Object.defineProperty(event, 'accelerationIncludingGravity', { value: window.__gravity })
      Object.defineProperty(event, 'acceleration', { value: { x: 0, y: 0, z: 0 } })
      window.dispatchEvent(event)
    }, 16)
  })
}

const readState = (page) => page.locator('[data-hud="state"]').innerText()

async function main() {
  await rm(SHOT_DIR, { recursive: true, force: true })
  await mkdir(SHOT_DIR, { recursive: true })

  const server = await createServer({ server: { port: 5199, strictPort: true } })
  await server.listen()

  // この環境には Playwright 同梱版とは別のビルド済み Chromium が置かれているため、
  // あれば実行ファイルを直接指定する。
  const bundledChromium = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  const launchOptions = existsSync(bundledChromium) ? { executablePath: bundledChromium } : {}
  const browser = await chromium.launch(launchOptions)
  const context = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true })
  const page = await context.newPage()

  const failures = []
  const consoleErrors = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(String(error)))

  await page.goto('http://localhost:5199/', { waitUntil: 'networkidle' })
  await page.screenshot({ path: `${SHOT_DIR}/00-start.png` })

  // センサーの値を流し始めてから開始ボタンを押す。
  await startMotionFeed(page)
  await page.click('#start-button')
  // hidden 属性が付いた時点が「センサーで開始できた」合図。既定の可視待ちでは通らない。
  await page.waitForSelector('#start-overlay[hidden]', { state: 'attached', timeout: 5000 })

  for (const testCase of CASES) {
    await page.evaluate((gravity) => {
      window.__gravity = gravity
    }, testCase.gravity)

    // 平滑化と安定待ち (0.15秒) を通過させる。
    await page.waitForTimeout(700)

    const actual = (await readState(page)).trim()
    const passed = actual === testCase.expected
    if (!passed) {
      failures.push(`${testCase.label}: expected "${testCase.expected}" but got "${actual}"`)
    }

    await page.screenshot({ path: `${SHOT_DIR}/${testCase.label}.png` })
    console.log(`${passed ? 'OK  ' : 'FAIL'} ${testCase.label.padEnd(22)} -> ${actual}`)
  }

  // センサーが無い環境でシミュレーションに落ちるかを、言語ごとに確認する。
  // 文言が翻訳されていることも同時に見る。
  const LOCALES = [
    { lang: 'en', continueLabel: 'Continue with simulation', caption: 'ORIENTATION STATE' },
    { lang: 'ja', continueLabel: 'シミュレーションで続ける', caption: 'ORIENTATION STATE' },
  ]

  for (const { lang, continueLabel } of LOCALES) {
    const plain = await browser.newPage()
    await plain.goto(`http://localhost:5199/?lang=${lang}`, { waitUntil: 'networkidle' })

    // 開始ボタンの文言が翻訳されているか。
    const startLabel = (await plain.locator('#start-button').innerText()).trim()
    const expectedStart = lang === 'ja' ? 'タップして開始' : 'Tap to start'
    if (startLabel !== expectedStart) {
      failures.push(`i18n(${lang}) start button: expected "${expectedStart}" but got "${startLabel}"`)
    }

    await plain.click('#start-button')
    await plain.waitForFunction(
      (label) => document.querySelector('#start-button')?.textContent?.includes(label),
      continueLabel,
      { timeout: 8000 },
    )
    await plain.click('#start-button')
    await plain.click('.hud-simulation button:nth-child(2)')
    await plain.waitForTimeout(600)

    const simulatedState = (await plain.locator('[data-hud="state"]').innerText()).trim()
    const passed = simulatedState === 'Landscape Left'
    if (!passed) {
      failures.push(`simulation fallback(${lang}): expected "Landscape Left" but got "${simulatedState}"`)
    }

    // 反対の言語の文言が混ざっていないか。
    const bodyText = await plain.locator('#hud').innerText()
    const japanesePattern = /[぀-ヿ一-龯]/
    if (lang === 'en' && japanesePattern.test(bodyText)) {
      failures.push(`i18n(en): HUD に日本語が残っています: ${bodyText.replace(/\s+/g, ' ').slice(0, 80)}`)
    }

    console.log(`${passed ? 'OK  ' : 'FAIL'} ${`simulation-${lang}`.padEnd(22)} -> ${simulatedState} / "${startLabel}"`)
    await plain.screenshot({ path: `${SHOT_DIR}/simulation-${lang}.png` })
  }

  await browser.close()
  await server.close()

  if (consoleErrors.length > 0) {
    console.log('\nconsole errors:')
    for (const error of consoleErrors) console.log('  ' + error)
  }

  if (failures.length > 0) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log('  ' + failure)
    process.exit(1)
  }

  console.log('\nすべて成功。スクリーンショット: ' + SHOT_DIR)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

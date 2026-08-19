/**
 * 実機相当の動作確認。
 *
 * ブラウザでページを開き、iOS が送ってくる形の DeviceMotionEvent を合成して流し込み、
 *   A. 姿勢判定が 4 方向とも正しいか
 *   B. ステージが実際に遊べてクリアできるか
 *   C. 日本語と英語で文言が出るか
 * を確認する。スクリーンショットは artifacts/shots/ に出る。
 *
 * 実行: npm run verify
 */
import { chromium, devices } from 'playwright-core'
import { mkdir, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { createServer } from 'vite'

const SHOT_DIR = 'artifacts/shots'
const PORT = 5199
const G = 9.81

/** 端末ローカルの重力。iOS の accelerationIncludingGravity はそのまま「下向き」を返す。 */
const GRAVITY = {
  portrait: { x: 0, y: -G, z: 0 },
  landscapeLeft: { x: -G, y: 0, z: 0 },
  upsideDown: { x: 0, y: G, z: 0 },
  landscapeRight: { x: G, y: 0, z: 0 },
  flat: { x: 0, y: 0, z: -G },
}

const ORIENTATION_CASES = [
  ['portrait', GRAVITY.portrait, 'Portrait'],
  ['landscape-left', GRAVITY.landscapeLeft, 'Landscape Left'],
  ['portrait-upside-down', GRAVITY.upsideDown, 'Portrait Upside Down'],
  ['landscape-right', GRAVITY.landscapeRight, 'Landscape Right'],
  ['flat-on-table', GRAVITY.flat, 'Landscape Right'],
  ['back-to-portrait', GRAVITY.portrait, 'Portrait'],
  // 90度ずつではなく真逆へ一気に飛ばす。補間の回転軸が定まらないケース。
  ['flip-180', GRAVITY.upsideDown, 'Portrait Upside Down'],
]

const failures = []

function check(passed, label, detail) {
  if (!passed) failures.push(`${label}: ${detail}`)
  console.log(`${passed ? 'OK  ' : 'FAIL'} ${label.padEnd(26)} ${detail}`)
}

/** ページ側で devicemotion を発火し続ける。実機の間隔に近づけて 60Hz。 */
function startMotionFeed(page) {
  return page.evaluate(() => {
    window.__gravity = { x: 0, y: -9.81, z: 0 }
    setInterval(() => {
      const event = new Event('devicemotion')
      Object.defineProperty(event, 'accelerationIncludingGravity', { value: window.__gravity })
      Object.defineProperty(event, 'acceleration', { value: { x: 0, y: 0, z: 0 } })
      window.dispatchEvent(event)
    }, 16)
  })
}

const setGravity = (page, gravity) => page.evaluate((g) => void (window.__gravity = g), gravity)

async function openWithSensor(context, query = '') {
  const page = await context.newPage()
  page.on('pageerror', (error) => failures.push(`pageerror: ${error}`))
  page.on('console', (message) => {
    if (message.type() === 'error') failures.push(`console: ${message.text()}`)
  })

  await page.goto(`http://localhost:${PORT}/${query}`, { waitUntil: 'networkidle' })
  await startMotionFeed(page)
  await page.click('#start-button')
  await page.waitForSelector('#start-overlay[hidden]', { state: 'attached', timeout: 8000 })
  return page
}

const readText = (page, selector) => page.locator(selector).innerText()
const isOverlayVisible = (page) =>
  page.locator('[data-game="overlay"]').evaluate((element) => !element.hidden)

/** 姿勢を取らせて、ボールが落ち着くまで待つ。 */
async function turnTo(page, gravity, settleMs = 2200) {
  await setGravity(page, gravity)
  await page.waitForTimeout(settleMs)
}

async function verifyOrientation(context) {
  console.log('\n--- A. 姿勢判定 ---')
  const page = await openWithSensor(context, '?debug=1&lang=en')

  for (const [label, gravity, expected] of ORIENTATION_CASES) {
    await setGravity(page, gravity)
    await page.waitForTimeout(700)
    const actual = (await readText(page, '[data-hud="state"]')).trim()
    check(actual === expected, label, `-> ${actual}`)
    await page.screenshot({ path: `${SHOT_DIR}/orientation-${label}.png` })
  }

  await page.close()
}

async function verifyGameplay(context) {
  console.log('\n--- B. ゲームとして遊べるか ---')
  const page = await openWithSensor(context, '?lang=en')

  // センサーが効いているときは代替操作を隠す。実機で邪魔になるため。
  const controlsHidden = await page
    .locator('[data-game="rotate-controls"]')
    .evaluate((element) => element.hidden)
  check(controlsHidden, 'controls-hidden-with-sensor', controlsHidden ? '隠れている' : '出たまま')

  await page.screenshot({ path: `${SHOT_DIR}/stage-1-start.png` })
  check(
    (await readText(page, '[data-game="stage"]')).includes('1 / 3'),
    'stage-1-loaded',
    (await readText(page, '[data-game="stage"]')).trim(),
  )

  // ステージ1: 右へ倒すだけ。
  await turnTo(page, GRAVITY.landscapeRight, 3000)
  check(await isOverlayVisible(page), 'stage-1-cleared', (await readText(page, '[data-game="overlay-title"]')).trim())
  await page.screenshot({ path: `${SHOT_DIR}/stage-1-cleared.png` })

  const turnsText = (await readText(page, '[data-game="turns"]')).trim()
  check(/\d/.test(turnsText), 'turns-counted', turnsText)

  // ステージ2へ。
  await page.click('[data-game="next"]')
  await page.waitForTimeout(300)
  check(
    (await readText(page, '[data-game="stage"]')).includes('2 / 3'),
    'stage-2-loaded',
    (await readText(page, '[data-game="stage"]')).trim(),
  )
  await page.screenshot({ path: `${SHOT_DIR}/stage-2-start.png` })

  // 素直に横へ倒すだけでは柱に阻まれる。
  await turnTo(page, GRAVITY.landscapeRight, 3000)
  check(!(await isOverlayVisible(page)), 'stage-2-blocked', 'まだクリアしていない')
  await page.screenshot({ path: `${SHOT_DIR}/stage-2-blocked.png` })

  // やり直してから、天井経由の正解手順。
  await page.click('[data-game="retry"]')
  await page.waitForTimeout(300)
  await turnTo(page, GRAVITY.upsideDown, 2600)
  await turnTo(page, GRAVITY.landscapeRight, 2600)
  await turnTo(page, GRAVITY.portrait, 3000)
  check(await isOverlayVisible(page), 'stage-2-cleared', (await readText(page, '[data-game="overlay-title"]')).trim())
  await page.screenshot({ path: `${SHOT_DIR}/stage-2-cleared.png` })

  // ステージ3。
  await page.click('[data-game="next"]')
  await page.waitForTimeout(300)
  await turnTo(page, GRAVITY.upsideDown, 2600)
  await turnTo(page, GRAVITY.landscapeLeft, 2600)
  await turnTo(page, GRAVITY.portrait, 3000)
  check(await isOverlayVisible(page), 'stage-3-cleared', (await readText(page, '[data-game="overlay-title"]')).trim())
  await page.screenshot({ path: `${SHOT_DIR}/stage-3-cleared.png` })

  const finalTitle = (await readText(page, '[data-game="overlay-title"]')).trim()
  check(finalTitle === 'ALL CLEAR', 'all-cleared', finalTitle)

  await page.close()
}

/**
 * OS が画面を回した状態でも成立するか。
 *
 * 世界が画面に固定されてしまうと、部屋から見た重力が常に「下」になり、
 * 端末を回しても何も起きなくなる。回転を打ち消せているかを見る。
 */
async function verifyScreenRotation(browser) {
  console.log('\n--- E. OS が画面を回した状態 ---')

  // 横向き (画面が 90 度回った状態) を再現する。
  const context = await browser.newContext({
    ...devices['iPhone 13 landscape'],
    hasTouch: true,
  })
  await context.addInitScript(() => {
    Object.defineProperty(screen.orientation, 'angle', { get: () => 90, configurable: true })
    Object.defineProperty(screen.orientation, 'type', { get: () => 'landscape-primary', configurable: true })
  })

  const page = await openWithSensor(context, '?lang=en')

  const worldRotation = await page.evaluate(() => screen.orientation.angle)
  check(worldRotation === 90, 'rotation-angle-applied', `screen.orientation.angle = ${worldRotation}`)

  // 画面が回っていても、端末を回せばゴールへ運べること。
  await turnTo(page, GRAVITY.landscapeRight, 3500)
  check(await isOverlayVisible(page), 'rotated-stage-clearable', 'ゴールできる')
  await page.screenshot({ path: `${SHOT_DIR}/screen-rotated.png` })

  await page.close()
  await context.close()
}

async function verifyLocales(context) {
  console.log('\n--- C. 言語 ---')
  const expected = [
    { lang: 'en', start: 'Tap to start', retry: 'Retry' },
    { lang: 'ja', start: 'タップして開始', retry: 'やり直す' },
  ]

  for (const { lang, start, retry } of expected) {
    const page = await context.newPage()
    await page.goto(`http://localhost:${PORT}/?lang=${lang}`, { waitUntil: 'networkidle' })

    const startLabel = (await readText(page, '#start-button')).trim()
    check(startLabel === start, `locale-${lang}-start`, `"${startLabel}"`)

    const retryLabel = (await readText(page, '[data-game="retry"]')).trim()
    check(retryLabel === retry, `locale-${lang}-retry`, `"${retryLabel}"`)

    // 反対の言語が混ざっていないか。
    if (lang === 'en') {
      const barText = await readText(page, '.game-bar')
      check(!/[぀-ヿ一-龯]/.test(barText), 'locale-en-no-japanese', barText.replace(/\s+/g, ' ').trim())
    }

    await page.screenshot({ path: `${SHOT_DIR}/locale-${lang}.png` })
    await page.close()
  }
}

async function verifySimulationFallback(context) {
  console.log('\n--- D. センサーが無い環境 ---')
  const page = await context.newPage()
  await page.goto(`http://localhost:${PORT}/?lang=en`, { waitUntil: 'networkidle' })
  await page.click('#start-button')
  await page.waitForFunction(
    () => document.querySelector('#start-button')?.textContent?.includes('Continue with simulation'),
    undefined,
    { timeout: 8000 },
  )
  await page.click('#start-button')

  // 端末を回す代わりの操作が出ていること。出ないとこの環境では遊べない。
  const controlsVisible = await page
    .locator('[data-game="rotate-controls"]')
    .evaluate((element) => !element.hidden)
  check(controlsVisible, 'fallback-controls-shown', controlsVisible ? '回転ボタンが出た' : '出ていない')
  await page.screenshot({ path: `${SHOT_DIR}/fallback-controls.png` })

  // 時計回りに 1 回 = LandscapeRight。ステージ1 の正解。
  await page.click('[data-rotate="-1"]')
  await page.waitForTimeout(3200)
  check(await isOverlayVisible(page), 'fallback-playable-by-button', 'ボタンでクリアできる')
  await page.screenshot({ path: `${SHOT_DIR}/fallback-cleared.png` })

  // キーボードでも同じ操作ができること。
  await page.click('[data-game="next"]')
  await page.waitForTimeout(300)
  await page.keyboard.press('ArrowRight')
  await page.waitForTimeout(1200)
  const turnsAfterKey = (await readText(page, '[data-game="turns"]')).trim()
  check(/[1-9]/.test(turnsAfterKey), 'fallback-keyboard', turnsAfterKey)

  await page.close()
}

async function main() {
  await rm(SHOT_DIR, { recursive: true, force: true })
  await mkdir(SHOT_DIR, { recursive: true })

  const server = await createServer({ server: { port: PORT, strictPort: true } })
  await server.listen()

  // この環境には Playwright 同梱版とは別のビルド済み Chromium が置かれている。
  const bundled = '/opt/pw-browsers/chromium-1194/chrome-linux/chrome'
  const browser = await chromium.launch(existsSync(bundled) ? { executablePath: bundled } : {})
  const context = await browser.newContext({ ...devices['iPhone 13'], hasTouch: true })

  try {
    await verifyOrientation(context)
    await verifyGameplay(context)
    await verifyScreenRotation(browser)
    await verifyLocales(context)
    await verifySimulationFallback(context)
  } finally {
    await browser.close()
    await server.close()
  }

  if (failures.length > 0) {
    console.log('\nFAILURES:')
    for (const failure of failures) console.log('  ' + failure)
    process.exit(1)
  }

  console.log(`\nすべて成功。スクリーンショット: ${SHOT_DIR}`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

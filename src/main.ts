import './style.css'
import { DeviceMotionAttitudeProvider, SimulatedAttitudeProvider, type AttitudeProvider } from './core/attitude'
import { OrientationManager } from './core/orientationManager'
import { OrientationState } from './core/orientation'
import { GravityManager } from './systems/gravityManager'
import { Phase0Scene } from './scene/phase0Scene'
import { Hud } from './ui/hud'

/** 1 フレームの経過秒の上限。タブ復帰時の巨大な dt で状態が飛ぶのを防ぐ。 */
const MAX_DELTA_SECONDS = 0.1

/** センサー開始後、最初の値が届くのを待つ上限 (ミリ秒)。 */
const SENSOR_WARMUP_TIMEOUT_MS = 1500
const SENSOR_POLL_INTERVAL_MS = 100

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const hudRoot = document.querySelector<HTMLElement>('#hud')!
const startOverlay = document.querySelector<HTMLElement>('#start-overlay')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startMessage = document.querySelector<HTMLElement>('#start-message')!

const simulatedProvider = new SimulatedAttitudeProvider(OrientationState.Portrait)
let motionProvider: DeviceMotionAttitudeProvider | null = null

const orientationManager = new OrientationManager(simulatedProvider)
const gravityManager = new GravityManager(orientationManager)
const scene = new Phase0Scene(canvas)

const hud = new Hud(hudRoot, {
  onSimulatedStateSelected: (state) => simulatedProvider.setState(state),
  onToggleGravitySign: () => {
    if (!motionProvider) {
      return
    }
    const next = motionProvider.getSignConvention() === 'ios' ? 'spec' : 'ios'
    motionProvider.setSignConvention(next)
  },
})

function useProvider(provider: AttitudeProvider): void {
  orientationManager.setProvider(provider)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * センサーが実際に値を返し始めるまで待つ。
 *
 * DeviceMotionEvent は「API が存在する」ことと「値が届く」ことが別問題で、
 * PC の Chrome のようにイベントが一度も発火しない環境がある。
 * 存在チェックだけで実センサーに切り替えると、画面が Unknown のまま固まって
 * 「壊れている」ように見えてしまうため、実データの到着で判断する。
 */
async function waitForAttitude(provider: DeviceMotionAttitudeProvider): Promise<boolean> {
  const deadline = performance.now() + SENSOR_WARMUP_TIMEOUT_MS

  while (performance.now() < deadline) {
    if (provider.read().available) {
      return true
    }
    await sleep(SENSOR_POLL_INTERVAL_MS)
  }

  return provider.read().available
}

/**
 * センサーを開始する。
 * iOS 13 以降はユーザー操作の中から requestPermission を呼ぶ必要があるため、
 * 起動直後ではなくタップを受けてから実行する。
 */
/**
 * 埋め込み (iframe) の中ではモーションセンサーの許可が下りないことがある。
 * その場合は Safari で直接開けば動くので、原因と対処を出す。
 */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // クロスオリジンで window.top を読めない = 埋め込まれている。
    return true
  }
}

async function startSensor(): Promise<void> {
  const embeddedHint = isEmbedded() ? ' ブラウザで直接開くとセンサーが使えます。' : ''
  const fallbackNotice = `シミュレーションで動作します。画面のボタンで姿勢を切り替えられます。${embeddedHint}`

  if (!DeviceMotionAttitudeProvider.isSupported()) {
    startMessage.textContent = `この環境にはモーションセンサーがありません。${fallbackNotice}`
    return
  }

  const provider = new DeviceMotionAttitudeProvider()
  try {
    await provider.start()
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'センサーを開始できませんでした'
    startMessage.textContent = `${reason}。${fallbackNotice}`
    return
  }

  startMessage.textContent = 'センサーを確認しています…'
  if (!(await waitForAttitude(provider))) {
    provider.stop()
    startMessage.textContent = `センサーから値が届きませんでした。${fallbackNotice}`
    return
  }

  motionProvider = provider
  useProvider(provider)
}

startButton.addEventListener('click', async () => {
  startButton.disabled = true
  await startSensor()

  // フォールバックした場合は理由を読ませたいので、その時だけ表示を残す。
  if (motionProvider) {
    startOverlay.hidden = true
    return
  }
  startButton.disabled = false
  startButton.textContent = 'シミュレーションで続ける'
  startButton.onclick = () => {
    startOverlay.hidden = true
  }
})

// HUD が覆う高さを渡し、部屋が隠れない位置に配置させる。
const layoutScene = (): void => scene.resize(hudRoot.getBoundingClientRect().bottom)

window.addEventListener('resize', layoutScene)
new ResizeObserver(layoutScene).observe(hudRoot)
layoutScene()

let lastTimestamp = performance.now()

function tick(timestamp: number): void {
  const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA_SECONDS)
  lastTimestamp = timestamp

  orientationManager.update(deltaSeconds)
  gravityManager.update(deltaSeconds)

  scene.update(gravityManager.direction)
  scene.render()
  hud.update(orientationManager, gravityManager, motionProvider === null)

  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

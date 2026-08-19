import './style.css'
import {
  DeviceMotionAttitudeProvider,
  MotionPermissionDeniedError,
  SimulatedAttitudeProvider,
  type AttitudeProvider,
} from './core/attitude'
import { OrientationManager } from './core/orientationManager'
import { OrientationState } from './core/orientation'
import { GravityManager } from './systems/gravityManager'
import { GameScene } from './scene/gameScene'
import { StageManager } from './stages/stageManager'
import { GameUi } from './ui/gameUi'
import { TiltControls } from './ui/tiltControls'
import { ShakeDetector } from './core/shake'
import { Hud } from './ui/hud'
import { applyStaticTranslations, createTranslator, detectLocale } from './i18n'
import { getScreenRotationDegrees, observeScreenRotation } from './core/screenRotation'

/** 1 フレームの経過秒の上限。タブ復帰時の巨大な dt で状態が飛ぶのを防ぐ。 */
const MAX_DELTA_SECONDS = 0.1

/** センサー開始後、最初の値が届くのを待つ上限 (ミリ秒)。 */
const SENSOR_WARMUP_TIMEOUT_MS = 1500
const SENSOR_POLL_INTERVAL_MS = 100

const locale = detectLocale()
const t = createTranslator(locale)
document.documentElement.lang = locale
applyStaticTranslations(document, locale)

const debugEnabled = new URLSearchParams(location.search).get('debug') === '1'

const canvas = document.querySelector<HTMLCanvasElement>('#scene')!
const gameRoot = document.querySelector<HTMLElement>('#game')!
const gameBar = document.querySelector<HTMLElement>('.game-bar')!
const hudRoot = document.querySelector<HTMLElement>('#hud')!
const startOverlay = document.querySelector<HTMLElement>('#start-overlay')!
const startButton = document.querySelector<HTMLButtonElement>('#start-button')!
const startMessage = document.querySelector<HTMLElement>('#start-message')!

const simulatedProvider = new SimulatedAttitudeProvider(OrientationState.Portrait)
const shakeDetector = new ShakeDetector()
let motionProvider: DeviceMotionAttitudeProvider | null = null

const orientationManager = new OrientationManager(simulatedProvider)
const gravityManager = new GravityManager(orientationManager)
const stageManager = new StageManager()
const scene = new GameScene(canvas)

// 端末を回した回数を手数として数える。ゲーム側の指標なのでここで繋ぐ。
orientationManager.onOrientationChanged(() => stageManager.countRotation())

const gameUi = new GameUi(gameRoot, t, {
  onRetry: () => {
    shakeDetector.reset()
    stageManager.restart()
  },
  onNext: () => stageManager.advance(),
  onReplayFromStart: () => stageManager.load(0),
  onReconnectSensor: () => {
    void startSensor()
  },
})

// センサーが無い環境では、画面のドラッグを傾きに割り当てる。
// 4 方向のボタンでは「傾けた量が結果に出る」という肝心の部分が再現できない。
//
// 受け口は盤面 (canvas) に限る。document.body に付けると、ポインタキャプチャが
// ボタンのクリックまで飲み込んでしまい、UI が反応しなくなる。
const tiltControls = new TiltControls(canvas, {
  onTilt: (roll, pitch) => simulatedProvider.setTilt(roll, pitch),
  onShake: () => stageManager.shake(gravityManager.gravity),
})
tiltControls.setEnabled(true)

stageManager.onStageLoaded((progress) => scene.loadStage(progress.stage))

const hud = debugEnabled
  ? new Hud(hudRoot, t, {
      onToggleGravitySign: () => {
        if (!motionProvider) {
          return
        }
        motionProvider.setSignConvention(motionProvider.getSignConvention() === 'ios' ? 'spec' : 'ios')
      },
    })
  : null

hudRoot.hidden = !debugEnabled

function useProvider(provider: AttitudeProvider): void {
  orientationManager.setProvider(provider)
}

const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms))

/**
 * センサーが実際に値を返し始めるまで待つ。
 *
 * DeviceMotionEvent は「API が存在する」ことと「値が届く」ことが別問題で、
 * PC の Chrome のようにイベントが一度も発火しない環境がある。
 * 存在チェックだけで実センサーに切り替えると、画面が固まって
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
 * 埋め込み (iframe) の中ではモーションセンサーの許可が下りないことがある。
 * その場合はブラウザで直接開けば動くので、原因と対処を出す。
 */
function isEmbedded(): boolean {
  try {
    return window.self !== window.top
  } catch {
    // クロスオリジンで window.top を読めない = 埋め込まれている。
    return true
  }
}

/**
 * センサーを開始する。
 * iOS 13 以降はユーザー操作の中から requestPermission を呼ぶ必要があるため、
 * 起動直後ではなくタップを受けてから実行する。
 */
async function startSensor(): Promise<void> {
  const embeddedHint = isEmbedded() ? ` ${t('sensor.embeddedHint')}` : ''
  const fallbackNotice = `${t('sensor.fallbackNotice')}${embeddedHint}`

  if (!DeviceMotionAttitudeProvider.isSupported()) {
    startMessage.textContent = `${t('sensor.unsupported')} ${fallbackNotice}`
    return
  }

  const provider = new DeviceMotionAttitudeProvider()
  try {
    await provider.start()
  } catch (error) {
    const reason =
      error instanceof MotionPermissionDeniedError ? t('sensor.denied') : t('sensor.startFailed')
    startMessage.textContent = `${reason}. ${fallbackNotice}`
    return
  }

  startMessage.textContent = t('sensor.checking')
  if (!(await waitForAttitude(provider))) {
    provider.stop()
    startMessage.textContent = `${t('sensor.noData')} ${fallbackNotice}`
    return
  }

  motionProvider = provider
  useProvider(provider)
  // 実機ではセンサーが本物なので、代替操作は止める。
  tiltControls.setEnabled(false)
  gameUi.setTiltHintVisible(false)
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
  startButton.textContent = t('start.continueSimulated')
  startButton.onclick = () => {
    startOverlay.hidden = true
    gameUi.setTiltHintVisible(true)
  }
})

// 上部の UI が覆う高さを渡し、部屋が隠れない位置に配置させる。
const layoutScene = (): void => {
  const inset = hudRoot.hidden
    ? gameBar.getBoundingClientRect().bottom
    : hudRoot.getBoundingClientRect().bottom
  scene.resize(inset)
}

// OS が画面を回したら、世界を回し返して端末との位置関係を保つ。
const applyScreenRotation = (degrees: number): void => {
  scene.setScreenRotationDegrees(degrees)
  layoutScene()
}

observeScreenRotation(applyScreenRotation)

window.addEventListener('resize', layoutScene)
new ResizeObserver(layoutScene).observe(gameRoot)
new ResizeObserver(layoutScene).observe(hudRoot)

stageManager.load(0)
applyScreenRotation(getScreenRotationDegrees())

let lastTimestamp = performance.now()

function tick(timestamp: number): void {
  const deltaSeconds = Math.min((timestamp - lastTimestamp) / 1000, MAX_DELTA_SECONDS)
  lastTimestamp = timestamp

  orientationManager.update(deltaSeconds)
  gravityManager.update(deltaSeconds)

  // 端末を振ったら玉を弾く。姿勢とは別の入力として扱う。
  if (shakeDetector.update(orientationManager.linearAcceleration, deltaSeconds)) {
    stageManager.shake(gravityManager.gravity)
  }

  stageManager.update(deltaSeconds, gravityManager.gravity)

  const progress = stageManager.progress
  scene.update(stageManager.ball.position, gravityManager.direction, progress.status === 'cleared')
  scene.render()
  gameUi.update(progress, stageManager.isLastStage)
  gameUi.updateSensorStatus({
    live: motionProvider !== null && orientationManager.attitudeAvailable,
    sourceName: orientationManager.sourceName,
    gravity: orientationManager.gravity,
  })
  hud?.update(orientationManager, gravityManager)

  requestAnimationFrame(tick)
}

requestAnimationFrame(tick)

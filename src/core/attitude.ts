import { MIN_VALID_GRAVITY_MAGNITUDE, normalize, stateToGravity, type OrientationState, type Vec3 } from './orientation'

/**
 * 1 フレーム分の端末姿勢データ。
 *
 * gravity は「端末ローカル座標系における重力の向き」を表す単位ベクトル。
 *   x: 画面右方向 / y: 画面上方向 / z: 画面手前方向
 * 端末を Portrait で立てて持つと gravity ≒ (0, -1, 0) になる。
 */
export interface DeviceAttitude {
  gravity: Vec3
  available: boolean
}

export const UNAVAILABLE_ATTITUDE: DeviceAttitude = {
  gravity: { x: 0, y: 0, z: 0 },
  available: false,
}

/**
 * 端末姿勢の取得元を抽象化する。
 *
 * これがあることで、
 *  - センサー API の癖 (iOS と仕様準拠実装で符号が逆) を上位に持ち込まない
 *  - 実機が無くてもシミュレーションで判定ロジックを検証できる
 *  - 将来ネイティブプラグイン経由に差し替えても上位を変えずに済む
 */
export interface AttitudeProvider {
  readonly sourceName: string
  /** センサーを有効化する。iOS では必ずユーザー操作 (タップ) の中から呼ぶこと。 */
  start(): Promise<void>
  stop(): void
  read(): DeviceAttitude
}

/**
 * 重力ベクトルの符号の解釈。
 *
 * iOS Safari / WKWebView は accelerationIncludingGravity を仕様と逆符号で返す。
 * 端末を立てて持つと iOS は (0, -9.8, 0)、仕様準拠の実装は (0, +9.8, 0) を返す。
 * つまり iOS は生値がそのまま「下向き」を指しており、仕様準拠側は反転が要る。
 */
export type GravitySignConvention = 'ios' | 'spec'

/**
 * モーションセンサーの利用許可が下りなかったことを表す。
 *
 * core は表示文言を持たない。どう伝えるかは UI 側の責務なので、
 * 型で区別できるようにしておき、翻訳は呼び出し側で行う。
 */
export class MotionPermissionDeniedError extends Error {
  constructor() {
    super('motion permission denied')
    this.name = 'MotionPermissionDeniedError'
  }
}

/** UserAgent から符号の既定値を推定する。誤っていても HUD から切り替えられる。 */
export function detectGravitySignConvention(userAgent: string): GravitySignConvention {
  const isAppleMobile = /iPad|iPhone|iPod/.test(userAgent)
  // iPadOS はデスクトップ Safari を名乗るため、タッチ対応の Macintosh も iOS 扱いにする。
  const isIpadOnDesktopUa = /Macintosh/.test(userAgent) && typeof document !== 'undefined' && 'ontouchend' in document
  return isAppleMobile || isIpadOnDesktopUa ? 'ios' : 'spec'
}

interface DeviceMotionProviderOptions {
  signConvention?: GravitySignConvention
}

/**
 * DeviceMotionEvent から姿勢を取得する実装。iOS Safari / Capacitor の WKWebView で動く。
 *
 * 重力の求め方:
 *   accelerationIncludingGravity から acceleration (重力を除いた線形加速度) を引くと
 *   純粋な重力成分が残る。端末を振っている最中でも姿勢がぶれにくい。
 *   acceleration が取れない環境では accelerationIncludingGravity をそのまま使う。
 */
export class DeviceMotionAttitudeProvider implements AttitudeProvider {
  readonly sourceName = 'DeviceMotionEvent'

  private latest: DeviceAttitude = UNAVAILABLE_ATTITUDE
  private signConvention: GravitySignConvention
  private listening = false

  private readonly handleMotion = (event: DeviceMotionEvent): void => {
    const withGravity = event.accelerationIncludingGravity
    if (!withGravity || withGravity.x === null || withGravity.y === null || withGravity.z === null) {
      return
    }

    const linear = event.acceleration
    const raw: Vec3 = {
      x: withGravity.x - (linear?.x ?? 0),
      y: withGravity.y - (linear?.y ?? 0),
      z: withGravity.z - (linear?.z ?? 0),
    }

    // 静止時の重力は約 9.8。これを大きく下回る値はノイズか自由落下中なので捨てる。
    if (Math.abs(raw.x) + Math.abs(raw.y) + Math.abs(raw.z) < MIN_VALID_GRAVITY_MAGNITUDE) {
      return
    }

    const normalized = normalize(raw)
    if (!normalized) {
      return
    }

    const sign = this.signConvention === 'ios' ? 1 : -1
    this.latest = {
      gravity: { x: normalized.x * sign, y: normalized.y * sign, z: normalized.z * sign },
      available: true,
    }
  }

  constructor(options: DeviceMotionProviderOptions = {}) {
    this.signConvention =
      options.signConvention ??
      detectGravitySignConvention(typeof navigator === 'undefined' ? '' : navigator.userAgent)
  }

  /** この環境で DeviceMotionEvent が存在するか。実際に値が来るかは start 後に判定する。 */
  static isSupported(): boolean {
    return typeof window !== 'undefined' && typeof window.DeviceMotionEvent !== 'undefined'
  }

  /** iOS 13 以降は明示的な許可が必要か。 */
  static needsPermission(): boolean {
    const ctor = window.DeviceMotionEvent as unknown as { requestPermission?: () => Promise<string> }
    return typeof ctor?.requestPermission === 'function'
  }

  async start(): Promise<void> {
    if (this.listening) {
      return
    }

    if (DeviceMotionAttitudeProvider.needsPermission()) {
      const ctor = window.DeviceMotionEvent as unknown as { requestPermission: () => Promise<string> }
      const result = await ctor.requestPermission()
      if (result !== 'granted') {
        throw new MotionPermissionDeniedError()
      }
    }

    window.addEventListener('devicemotion', this.handleMotion)
    this.listening = true
  }

  stop(): void {
    if (!this.listening) {
      return
    }
    window.removeEventListener('devicemotion', this.handleMotion)
    this.listening = false
  }

  read(): DeviceAttitude {
    return this.latest
  }

  getSignConvention(): GravitySignConvention {
    return this.signConvention
  }

  /** 実機で上下が逆に出た場合の切り替え用。 */
  setSignConvention(convention: GravitySignConvention): void {
    this.signConvention = convention
  }
}

/**
 * センサーを使わず、指定された姿勢をそのまま返す実装。
 * PC ブラウザでの開発と、センサーが取れない実機での手動確認に使う。
 */
export class SimulatedAttitudeProvider implements AttitudeProvider {
  readonly sourceName = 'Simulated'

  private state: OrientationState

  constructor(initialState: OrientationState) {
    this.state = initialState
  }

  async start(): Promise<void> {}

  stop(): void {}

  read(): DeviceAttitude {
    return { gravity: stateToGravity(this.state), available: true }
  }

  setState(state: OrientationState): void {
    this.state = state
  }
}

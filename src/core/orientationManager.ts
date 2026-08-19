import type { AttitudeProvider } from './attitude'
import {
  OrientationState,
  SECTOR_HALF_ANGLE_DEGREES,
  angleDistanceToState,
  gravityToRollDegrees,
  rollToNearestState,
  slerpDirection,
  smoothingFactor,
  type Vec3,
} from './orientation'

export interface OrientationManagerOptions {
  /** 重力ベクトルの平滑化の半減期 (秒)。大きいほど滑らかだが反応が遅くなる。 */
  gravitySmoothingHalfLifeSeconds?: number
  /** 境界角でのバタつきを防ぐ余裕角 (度)。45 度 + この値を超えて初めて隣の姿勢へ移る。 */
  hysteresisDegrees?: number
  /** 新しい姿勢がこの秒数続いて初めて確定させる。 */
  stabilizationSeconds?: number
  /** 画面平面成分がこの値未満なら平置き(水平)とみなし、姿勢判定を保留する。 */
  flatPlanarGravityThreshold?: number
}

const DEFAULT_OPTIONS: Required<OrientationManagerOptions> = {
  gravitySmoothingHalfLifeSeconds: 0.06,
  hysteresisDegrees: 12,
  stabilizationSeconds: 0.15,
  flatPlanarGravityThreshold: 0.35,
}

export type OrientationChangeListener = (current: OrientationState, previous: OrientationState) => void

/**
 * 端末の物理姿勢を監視し、OrientationState として公開する中核システム。
 *
 * 設計上の約束:
 *  - OS の画面自動回転 (screen.orientation) は一切参照しない。
 *  - 判定結果は「状態」と「連続角」の両方を公開する。
 *    重力の演出は連続角を使いたいが、ギミックやステージ判定は状態だけで足りるため。
 *  - 姿勢が変わった瞬間はリスナーで通知する。ポーリングでもイベント駆動でも使える。
 */
export class OrientationManager {
  private readonly options: Required<OrientationManagerOptions>
  private readonly listeners = new Set<OrientationChangeListener>()

  private provider: AttitudeProvider
  private smoothedGravity: Vec3 = { x: 0, y: -1, z: 0 }
  private hasSmoothedGravity = false
  private pendingState: OrientationState = OrientationState.Unknown
  private pendingElapsedSeconds = 0

  current: OrientationState = OrientationState.Unknown
  rollDegrees = 0
  rawGravity: Vec3 = { x: 0, y: 0, z: 0 }
  /** 重力を除いた加速度。振る操作の判定に使う。 */
  linearAcceleration: Vec3 = { x: 0, y: 0, z: 0 }
  flat = false
  attitudeAvailable = false

  constructor(provider: AttitudeProvider, options: OrientationManagerOptions = {}) {
    this.provider = provider
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  get sourceName(): string {
    return this.provider.sourceName
  }

  get gravity(): Vec3 {
    return this.smoothedGravity
  }

  /** 取得元を差し替える。シミュレーションと実センサーの切り替えに使う。 */
  setProvider(provider: AttitudeProvider): void {
    this.provider = provider
    this.hasSmoothedGravity = false
  }

  onOrientationChanged(listener: OrientationChangeListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  /** 毎フレーム呼ぶ。deltaSeconds は前回呼び出しからの経過秒。 */
  update(deltaSeconds: number): void {
    const attitude = this.provider.read()
    this.attitudeAvailable = attitude.available
    if (!attitude.available) {
      return
    }

    this.rawGravity = attitude.gravity
    this.linearAcceleration = attitude.linearAcceleration
    this.updateSmoothedGravity(attitude.gravity, deltaSeconds)
    this.updateOrientation(deltaSeconds)
  }

  private updateSmoothedGravity(gravity: Vec3, deltaSeconds: number): void {
    if (!this.hasSmoothedGravity) {
      this.smoothedGravity = gravity
      this.hasSmoothedGravity = true
      return
    }

    const factor = smoothingFactor(this.options.gravitySmoothingHalfLifeSeconds, deltaSeconds)
    this.smoothedGravity = slerpDirection(this.smoothedGravity, gravity, factor)
  }

  private updateOrientation(deltaSeconds: number): void {
    const planarMagnitude = Math.hypot(this.smoothedGravity.x, this.smoothedGravity.y)
    this.flat = planarMagnitude < this.options.flatPlanarGravityThreshold

    // 平置き中は画面平面の回転が定義できない。直前の姿勢を保持する。
    if (this.flat) {
      this.resetPending()
      return
    }

    this.rollDegrees = gravityToRollDegrees(this.smoothedGravity)
    this.commitWhenStable(this.resolveCandidate(this.rollDegrees), deltaSeconds)
  }

  /**
   * ヒステリシス付きで候補の姿勢を決める。
   * 現在の姿勢の基準角から (45 度 + 余裕角) 以上離れるまでは姿勢を変えない。
   */
  private resolveCandidate(rollDegrees: number): OrientationState {
    if (this.current === OrientationState.Unknown) {
      return rollToNearestState(rollDegrees)
    }

    const distance = angleDistanceToState(rollDegrees, this.current)
    const leftCurrentSector = distance > SECTOR_HALF_ANGLE_DEGREES + this.options.hysteresisDegrees

    return leftCurrentSector ? rollToNearestState(rollDegrees) : this.current
  }

  /** 候補姿勢が安定時間だけ継続したら確定させ、リスナーへ通知する。 */
  private commitWhenStable(candidate: OrientationState, deltaSeconds: number): void {
    if (candidate === this.current) {
      this.resetPending()
      return
    }

    if (candidate !== this.pendingState) {
      this.pendingState = candidate
      this.pendingElapsedSeconds = 0
    }

    this.pendingElapsedSeconds += deltaSeconds
    if (this.pendingElapsedSeconds < this.options.stabilizationSeconds) {
      return
    }

    const previous = this.current
    this.current = candidate
    this.resetPending()

    for (const listener of this.listeners) {
      listener(this.current, previous)
    }
  }

  private resetPending(): void {
    this.pendingState = this.current
    this.pendingElapsedSeconds = 0
  }
}

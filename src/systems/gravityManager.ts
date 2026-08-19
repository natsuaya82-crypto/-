import type { OrientationManager } from '../core/orientationManager'
import { slerpDirection, smoothingFactor, stateToGravity, type Vec3 } from '../core/orientation'

/** 重力の決め方。 */
export type GravityFollowMode =
  /**
   * 端末の傾きにそのまま追従する。斜めに傾ければ斜めに、
   * 手前に倒せば奥行き方向にも力がかかる。既定。
   */
  | 'continuous'
  /**
   * 4 方向にスナップする。挙動は読みやすいが、傾けた量が結果に出ない。
   * 特定のギミック用に残してある。
   */
  | 'snapToState'

export interface GravityManagerOptions {
  followMode?: GravityFollowMode
  /** 重力の大きさ (m/s^2)。 */
  magnitude?: number
  /** 重力方向の回転の半減期 (秒)。0 で即時。 */
  rotationHalfLifeSeconds?: number
}

const DEFAULT_OPTIONS: Required<GravityManagerOptions> = {
  followMode: 'continuous',
  magnitude: 9.81,
  // 連続追従では小さめにする。大きいと傾けてから効き始めるまでが鈍く感じる。
  rotationHalfLifeSeconds: 0.05,
}

/**
 * 端末の姿勢からゲーム世界の重力を決める。
 *
 * 端末ローカルの重力ベクトルが、そのまま世界の重力になる。
 * 世界は端末に固定されているので、変換は要らない。
 */
export class GravityManager {
  private readonly orientationManager: OrientationManager
  private readonly options: Required<GravityManagerOptions>

  direction: Vec3 = { x: 0, y: -1, z: 0 }

  constructor(orientationManager: OrientationManager, options: GravityManagerOptions = {}) {
    this.orientationManager = orientationManager
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /** 現在の重力ベクトル (方向 × 大きさ)。 */
  get gravity(): Vec3 {
    const { x, y, z } = this.direction
    const m = this.options.magnitude
    return { x: x * m, y: y * m, z: z * m }
  }

  update(deltaSeconds: number): void {
    const target = this.resolveTargetDirection()
    const factor = smoothingFactor(this.options.rotationHalfLifeSeconds, deltaSeconds)
    this.direction = slerpDirection(this.direction, target, factor)
  }

  private resolveTargetDirection(): Vec3 {
    if (this.options.followMode === 'snapToState') {
      return stateToGravity(this.orientationManager.current)
    }

    // 平滑化済みの重力ベクトルをそのまま使う。奥行き成分も含めて 3 次元で効く。
    return this.orientationManager.gravity
  }
}

import type { OrientationManager } from '../core/orientationManager'
import { rollToDownDirection, slerpDirection, smoothingFactor, stateToGravity, type Vec3 } from '../core/orientation'

/** 重力方向の追従方法。 */
export type GravityFollowMode =
  /** 確定した OrientationState の 4 方向にスナップする。パズルとして挙動が読みやすい。 */
  | 'snapToState'
  /** 実際の傾き角にそのまま追従する。演出寄りの挙動。 */
  | 'followRawTilt'

export interface GravityManagerOptions {
  followMode?: GravityFollowMode
  /** 重力の大きさ (m/s^2)。 */
  magnitude?: number
  /** 重力方向の回転の半減期 (秒)。0 で即時。 */
  rotationHalfLifeSeconds?: number
}

const DEFAULT_OPTIONS: Required<GravityManagerOptions> = {
  followMode: 'snapToState',
  magnitude: 9.81,
  rotationHalfLifeSeconds: 0.08,
}

/**
 * 端末姿勢からゲーム世界の重力方向を決めるシステム。
 *
 * Phase 0 での責務はここまでに限定する:
 *   OrientationManager の結果を「世界座標の重力ベクトル」に変換して公開する。
 *
 * 実際に物を落とす・プレイヤーを動かすのは Phase 1 以降の責務。
 * ここでは値を提供するだけに留める。
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
    if (this.options.followMode === 'followRawTilt') {
      return rollToDownDirection(this.orientationManager.rollDegrees)
    }
    return stateToGravity(this.orientationManager.current)
  }
}

import type { Vec3 } from './orientation'

/**
 * 端末を「振った」ことを検出する。
 *
 * 姿勢 (どう持っているか) とは別の入力。傾けるだけでは足りない場面で、
 * もう一段の操作を足すために使う。
 *
 * 重力を除いた加速度の大きさを見る。重力込みの値だと、単に持ち替えただけで
 * 反応してしまうため使わない。
 */
export interface ShakeDetectorOptions {
  /** この加速度 (m/s^2) を超えたら振ったとみなす。 */
  thresholdMetersPerSecondSquared?: number
  /** 一度検出したら、この秒数は次を検出しない。1 回の振りが連発するのを防ぐ。 */
  cooldownSeconds?: number
  /** 加速度の平滑化の半減期 (秒)。単発のノイズで誤検出しないため。 */
  smoothingHalfLifeSeconds?: number
}

const DEFAULT_OPTIONS: Required<ShakeDetectorOptions> = {
  thresholdMetersPerSecondSquared: 12,
  cooldownSeconds: 0.6,
  smoothingHalfLifeSeconds: 0.03,
}

export class ShakeDetector {
  private readonly options: Required<ShakeDetectorOptions>
  private smoothedMagnitude = 0
  private cooldownRemaining = 0

  constructor(options: ShakeDetectorOptions = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options }
  }

  /** 直近の揺れの強さ。0〜1 に正規化した目安。演出の強度に使える。 */
  get intensity(): number {
    return Math.min(this.smoothedMagnitude / this.options.thresholdMetersPerSecondSquared, 1)
  }

  reset(): void {
    this.smoothedMagnitude = 0
    this.cooldownRemaining = 0
  }

  /**
   * 1 フレーム分の加速度を渡す。振ったと判定したフレームで true を返す。
   */
  update(linearAcceleration: Vec3, deltaSeconds: number): boolean {
    const magnitude = Math.hypot(linearAcceleration.x, linearAcceleration.y, linearAcceleration.z)

    const halfLife = this.options.smoothingHalfLifeSeconds
    const factor = halfLife > 0 && deltaSeconds > 0 ? 1 - Math.exp((-deltaSeconds * Math.LN2) / halfLife) : 1
    this.smoothedMagnitude += (magnitude - this.smoothedMagnitude) * factor

    if (this.cooldownRemaining > 0) {
      this.cooldownRemaining = Math.max(0, this.cooldownRemaining - deltaSeconds)
      return false
    }

    if (this.smoothedMagnitude < this.options.thresholdMetersPerSecondSquared) {
      return false
    }

    this.cooldownRemaining = this.options.cooldownSeconds
    return true
  }
}

/**
 * センサーが無い環境で「端末を傾ける」を代わりに行う操作。
 *
 * 4 方向のボタンでは、傾けた量が結果に出るという肝心の部分が再現できない。
 * 画面をなぞった量をそのまま傾きに割り当てて、連続的に効くようにする。
 *
 * 実機ではセンサーが本物なので、この操作は出さない。
 */

export interface TiltControlsCallbacks {
  /** roll と pitch。どちらも -1 〜 1。 */
  onTilt(roll: number, pitch: number): void
  onShake(): void
}

/** 画面の何割をなぞったら最大まで傾いたことにするか。 */
const DRAG_RANGE_RATIO = 0.35

/** キーボード 1 回の押下で傾きがどれだけ変わるか。 */
const KEY_STEP = 0.08

export class TiltControls {
  private roll = 0
  private pitch = 0
  private pointerId: number | null = null
  private originX = 0
  private originY = 0
  private startRoll = 0
  private startPitch = 0
  private enabled = false

  constructor(
    private readonly surface: HTMLElement,
    private readonly callbacks: TiltControlsCallbacks,
  ) {
    surface.addEventListener('pointerdown', this.handlePointerDown)
    surface.addEventListener('pointermove', this.handlePointerMove)
    surface.addEventListener('pointerup', this.handlePointerUp)
    surface.addEventListener('pointercancel', this.handlePointerUp)
    window.addEventListener('keydown', this.handleKeyDown)
  }

  setEnabled(enabled: boolean): void {
    this.enabled = enabled
    if (!enabled) {
      this.pointerId = null
    }
  }

  private emit(): void {
    this.callbacks.onTilt(this.roll, this.pitch)
  }

  private setTilt(roll: number, pitch: number): void {
    this.roll = Math.min(1, Math.max(-1, roll))
    this.pitch = Math.min(1, Math.max(-1, pitch))
    this.emit()
  }

  private readonly handlePointerDown = (event: PointerEvent): void => {
    if (!this.enabled) {
      return
    }
    this.pointerId = event.pointerId
    this.originX = event.clientX
    this.originY = event.clientY
    this.startRoll = this.roll
    this.startPitch = this.pitch
    this.surface.setPointerCapture(event.pointerId)
  }

  private readonly handlePointerMove = (event: PointerEvent): void => {
    if (!this.enabled || this.pointerId !== event.pointerId) {
      return
    }

    const range = Math.min(window.innerWidth, window.innerHeight) * DRAG_RANGE_RATIO
    const deltaRoll = (event.clientX - this.originX) / range
    // 画面を下へなぞったら手前に倒す。指の動きと端末の動きの向きを揃える。
    const deltaPitch = (event.clientY - this.originY) / range

    this.setTilt(this.startRoll + deltaRoll, this.startPitch + deltaPitch)
  }

  private readonly handlePointerUp = (event: PointerEvent): void => {
    if (this.pointerId !== event.pointerId) {
      return
    }
    this.pointerId = null
  }

  private readonly handleKeyDown = (event: KeyboardEvent): void => {
    if (!this.enabled) {
      return
    }

    switch (event.key) {
      case 'ArrowLeft':
        this.setTilt(this.roll - KEY_STEP, this.pitch)
        break
      case 'ArrowRight':
        this.setTilt(this.roll + KEY_STEP, this.pitch)
        break
      case 'ArrowUp':
        this.setTilt(this.roll, this.pitch - KEY_STEP)
        break
      case 'ArrowDown':
        this.setTilt(this.roll, this.pitch + KEY_STEP)
        break
      case ' ':
        this.callbacks.onShake()
        break
      default:
        return
    }

    event.preventDefault()
  }
}

import { OrientationState, toDisplayName, type Vec3 } from '../core/orientation'
import type { OrientationManager } from '../core/orientationManager'
import type { GravityManager } from '../systems/gravityManager'

const SELECTABLE_STATES = [
  OrientationState.Portrait,
  OrientationState.LandscapeLeft,
  OrientationState.PortraitUpsideDown,
  OrientationState.LandscapeRight,
] as const

function formatVector(v: Vec3): string {
  const format = (n: number): string => n.toFixed(2).padStart(6, ' ')
  return `(${format(v.x)}, ${format(v.y)}, ${format(v.z)})`
}

export interface HudCallbacks {
  /** シミュレーション動作中に姿勢ボタンが押されたとき。 */
  onSimulatedStateSelected(state: OrientationState): void
  /** 重力の符号を反転させたいとき (実機で上下が逆に出た場合)。 */
  onToggleGravitySign(): void
}

/**
 * Phase 0 の検証用 HUD。現在の姿勢と生データを DOM で表示する。
 * 本番 UI ではないので、Phase 1 以降で作り直す前提。
 */
export class Hud {
  private readonly stateLabel: HTMLElement
  private readonly rows: Record<string, HTMLElement> = {}
  private readonly simulationPanel: HTMLElement

  constructor(root: HTMLElement, callbacks: HudCallbacks) {
    this.stateLabel = root.querySelector<HTMLElement>('[data-hud="state"]')!
    this.simulationPanel = root.querySelector<HTMLElement>('[data-hud="simulation"]')!

    for (const element of root.querySelectorAll<HTMLElement>('[data-row]')) {
      this.rows[element.dataset.row!] = element
    }

    for (const state of SELECTABLE_STATES) {
      const button = document.createElement('button')
      button.type = 'button'
      button.textContent = toDisplayName(state)
      button.addEventListener('click', () => callbacks.onSimulatedStateSelected(state))
      this.simulationPanel.append(button)
    }

    root
      .querySelector<HTMLElement>('[data-hud="invert"]')!
      .addEventListener('click', () => callbacks.onToggleGravitySign())
  }

  update(orientation: OrientationManager, gravity: GravityManager, simulated: boolean): void {
    this.stateLabel.textContent = toDisplayName(orientation.current)

    this.setRow('roll', `${orientation.rollDegrees.toFixed(1)}°`)
    this.setRow('source', orientation.sourceName)
    this.setRow('available', String(orientation.attitudeAvailable))
    this.setRow('flat', String(orientation.flat))
    this.setRow('raw', formatVector(orientation.rawGravity))
    this.setRow('smoothed', formatVector(orientation.gravity))
    this.setRow('world', formatVector(gravity.direction))

    // OS の画面回転はゲームロジックに使っていない。比較のために出しているだけ。
    this.setRow('os', `${screen.orientation?.type ?? 'unknown'} (未使用)`)

    this.simulationPanel.hidden = !simulated
  }

  private setRow(name: string, value: string): void {
    const element = this.rows[name]
    if (element) {
      element.textContent = value
    }
  }
}

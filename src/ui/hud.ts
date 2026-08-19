import { toDisplayName, type Vec3 } from '../core/orientation'
import type { OrientationManager } from '../core/orientationManager'
import type { GravityManager } from '../systems/gravityManager'
import type { MessageKey } from '../i18n'

function formatVector(v: Vec3): string {
  const format = (n: number): string => n.toFixed(2).padStart(6, ' ')
  return `(${format(v.x)}, ${format(v.y)}, ${format(v.z)})`
}

export interface HudCallbacks {
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
  private readonly t: (key: MessageKey) => string

  constructor(root: HTMLElement, translate: (key: MessageKey) => string, callbacks: HudCallbacks) {
    this.t = translate
    this.stateLabel = root.querySelector<HTMLElement>('[data-hud="state"]')!

    for (const element of root.querySelectorAll<HTMLElement>('[data-row]')) {
      this.rows[element.dataset.row!] = element
    }

    root
      .querySelector<HTMLElement>('[data-hud="invert"]')!
      .addEventListener('click', () => callbacks.onToggleGravitySign())
  }

  update(orientation: OrientationManager, gravity: GravityManager): void {
    this.stateLabel.textContent = toDisplayName(orientation.current)

    this.setRow('roll', `${orientation.rollDegrees.toFixed(1)}°`)
    this.setRow('source', orientation.sourceName)
    this.setRow('available', String(orientation.attitudeAvailable))
    this.setRow('flat', String(orientation.flat))
    this.setRow('raw', formatVector(orientation.rawGravity))
    this.setRow('smoothed', formatVector(orientation.gravity))
    this.setRow('world', formatVector(gravity.direction))

    // OS の画面回転はゲームロジックに使っていない。比較のために出しているだけ。
    const screenAngle = screen.orientation?.angle ?? 0
    this.setRow('os', `${screen.orientation?.type ?? 'unknown'} ${screenAngle}° (${this.t('hud.unused')})`)

  }

  private setRow(name: string, value: string): void {
    const element = this.rows[name]
    if (element) {
      element.textContent = value
    }
  }
}

import type { MessageKey } from '../i18n'
import type { StageProgress } from '../stages/stageManager'

export interface GameUiCallbacks {
  onRetry(): void
  onNext(): void
  onReplayFromStart(): void
  /** センサーへの再接続を試す。iOS では利用者の操作の中でしか許可を求められない。 */
  onReconnectSensor(): void
}

/** センサーの状態。画面に常時出して、黙って代替動作に落ちないようにする。 */
export interface SensorStatus {
  live: boolean
  sourceName: string
  gravity: { x: number; y: number; z: number }
}

function formatVector(v: { x: number; y: number; z: number }): string {
  const format = (n: number): string => n.toFixed(2).padStart(5, ' ')
  return `${format(v.x)}, ${format(v.y)}, ${format(v.z)}`
}

/**
 * ゲーム本体の UI。ステージ番号・回転数・クリア表示だけを持つ。
 *
 * 姿勢の生データは開発時にしか要らないので、ここには出さない。
 * それは ?debug=1 のときだけ出る別の HUD の役目。
 */
export class GameUi {
  private readonly stageLabel: HTMLElement
  private readonly turnsLabel: HTMLElement
  private readonly overlay: HTMLElement
  private readonly overlayTitle: HTMLElement
  private readonly overlayNote: HTMLElement
  private readonly nextButton: HTMLButtonElement
  private readonly tiltHint: HTMLElement
  private readonly statusButton: HTMLElement
  private readonly statusDot: HTMLElement
  private readonly statusLabel: HTMLElement
  private readonly diagnostics: HTMLElement
  private readonly diagnosticsCauses: HTMLElement
  private readonly diagnosticsRows: Record<string, HTMLElement> = {}
  private lastStatusKey = ''

  private readonly t: (key: MessageKey) => string
  private lastRenderedKey = ''

  constructor(root: HTMLElement, translate: (key: MessageKey) => string, callbacks: GameUiCallbacks) {
    this.t = translate

    this.stageLabel = root.querySelector<HTMLElement>('[data-game="stage"]')!
    this.turnsLabel = root.querySelector<HTMLElement>('[data-game="turns"]')!
    this.overlay = root.querySelector<HTMLElement>('[data-game="overlay"]')!
    this.overlayTitle = root.querySelector<HTMLElement>('[data-game="overlay-title"]')!
    this.overlayNote = root.querySelector<HTMLElement>('[data-game="overlay-note"]')!
    this.nextButton = root.querySelector<HTMLButtonElement>('[data-game="next"]')!

    root.querySelector<HTMLButtonElement>('[data-game="retry"]')!.addEventListener('click', () => {
      callbacks.onRetry()
    })

    this.nextButton.addEventListener('click', () => {
      if (this.nextButton.dataset.action === 'replay') {
        callbacks.onReplayFromStart()
        return
      }
      callbacks.onNext()
    })

    this.tiltHint = root.querySelector<HTMLElement>('[data-game="tilt-hint"]')!

    this.statusButton = root.querySelector<HTMLElement>('[data-game="status"]')!
    this.statusDot = root.querySelector<HTMLElement>('[data-game="status-dot"]')!
    this.statusLabel = root.querySelector<HTMLElement>('[data-game="status-label"]')!
    this.diagnostics = root.querySelector<HTMLElement>('[data-game="diagnostics"]')!
    this.diagnosticsCauses = root.querySelector<HTMLElement>('[data-diag="causes"]')!

    for (const element of root.querySelectorAll<HTMLElement>('[data-diag]')) {
      const name = element.dataset.diag!
      if (name !== 'causes' && name !== 'retry' && name !== 'close') {
        this.diagnosticsRows[name] = element
      }
    }

    this.statusButton.addEventListener('click', () => {
      this.diagnostics.hidden = !this.diagnostics.hidden
    })
    root.querySelector<HTMLElement>('[data-diag="close"]')!.addEventListener('click', () => {
      this.diagnostics.hidden = true
    })
    root.querySelector<HTMLElement>('[data-diag="retry"]')!.addEventListener('click', () => {
      callbacks.onReconnectSensor()
    })
  }

  /**
   * センサーの状態を反映する。
   * 数値は常に更新する。傾けて動くかどうかが、繋がっているかの唯一の確かめ方なので。
   */
  updateSensorStatus(status: SensorStatus): void {
    this.diagnosticsRows.source!.textContent = status.sourceName
    this.diagnosticsRows.gravity!.textContent = formatVector(status.gravity)

    const key = String(status.live)
    if (key === this.lastStatusKey) {
      return
    }
    this.lastStatusKey = key

    this.statusButton.dataset.live = key
    this.statusLabel.textContent = this.t(status.live ? 'status.live' : 'status.simulated')
    this.diagnosticsCauses.hidden = status.live
    void this.statusDot
  }

  /**
   * センサーが無い環境向けの操作説明を出すかどうか。
   * 実機ではセンサーが本物なので隠す。
   */
  setTiltHintVisible(visible: boolean): void {
    this.tiltHint.hidden = !visible
  }

  update(progress: StageProgress, isLastStage: boolean): void {
    // 毎フレーム DOM を書き換えると、iOS で文字がちらつくことがある。
    // 表示が変わるときだけ触る。
    const key = `${progress.index}/${progress.rotations}/${progress.status}`
    if (key === this.lastRenderedKey) {
      return
    }
    this.lastRenderedKey = key

    this.stageLabel.textContent = `${this.t('ui.stage')} ${progress.index + 1} / ${progress.total}`
    this.turnsLabel.textContent = `${this.t('ui.turns')} ${progress.rotations}`

    if (progress.status !== 'cleared') {
      this.overlay.hidden = true
      return
    }

    const allCleared = isLastStage
    this.overlayTitle.textContent = allCleared ? this.t('ui.allCleared') : this.t('ui.cleared')
    this.overlayNote.textContent = allCleared ? this.t('ui.allClearedNote') : ''
    this.nextButton.textContent = allCleared ? this.t('ui.replay') : this.t('ui.next')
    this.nextButton.dataset.action = allCleared ? 'replay' : 'next'
    this.overlay.hidden = false
  }
}

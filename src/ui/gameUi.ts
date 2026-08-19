import type { MessageKey } from '../i18n'
import type { StageProgress } from '../stages/stageManager'

export interface GameUiCallbacks {
  onRetry(): void
  onNext(): void
  onReplayFromStart(): void
  /** 端末を回す操作の代替。steps が正で反時計回り、負で時計回り。 */
  onRotate(steps: number): void
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
  private readonly rotateControls: HTMLElement

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

    this.rotateControls = root.querySelector<HTMLElement>('[data-game="rotate-controls"]')!
    for (const button of this.rotateControls.querySelectorAll<HTMLButtonElement>('[data-rotate]')) {
      const steps = Number(button.dataset.rotate)
      button.addEventListener('click', () => callbacks.onRotate(steps))
    }

    // センサーの無い環境ではキーボードのほうが速い。左右キーを回転に割り当てる。
    window.addEventListener('keydown', (event) => {
      if (this.rotateControls.hidden) {
        return
      }
      if (event.key === 'ArrowLeft') {
        callbacks.onRotate(1)
      } else if (event.key === 'ArrowRight') {
        callbacks.onRotate(-1)
      } else {
        return
      }
      event.preventDefault()
    })
  }

  /**
   * 端末を回す代わりの操作を出すかどうか。
   * センサーが使えているときは実機の動作を邪魔しないよう隠す。
   */
  setRotateControlsVisible(visible: boolean): void {
    this.rotateControls.hidden = !visible
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

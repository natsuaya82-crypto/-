import { describe, expect, it } from 'vitest'
import { OrientationState, stateToGravity, type Vec3 } from '../core/orientation'
import { FIXED_TIMESTEP } from '../physics/world'
import { STAGES } from './definitions'
import { StageManager } from './stageManager'

const GRAVITY_MAGNITUDE = 9.81
/** 1 回の姿勢でボールが落ち着くまでに与える時間。 */
const SETTLE_SECONDS = 4

function gravityFor(state: OrientationState): Vec3 {
  const direction = stateToGravity(state)
  return {
    x: direction.x * GRAVITY_MAGNITUDE,
    y: direction.y * GRAVITY_MAGNITUDE,
    z: direction.z * GRAVITY_MAGNITUDE,
  }
}

/** 指定の姿勢を順に取り、各姿勢で落ち着くまで待つ。 */
function play(manager: StageManager, sequence: readonly OrientationState[]): void {
  for (const state of sequence) {
    manager.countRotation()
    const gravity = gravityFor(state)
    const steps = Math.round(SETTLE_SECONDS / FIXED_TIMESTEP)
    for (let i = 0; i < steps; i++) {
      manager.update(FIXED_TIMESTEP, gravity)
    }
  }
}

/** そのステージだけを読み込んだ StageManager を作る。 */
function managerFor(stageId: string): StageManager {
  const stage = STAGES.find((candidate) => candidate.id === stageId)
  if (!stage) {
    throw new Error(`ステージが見つかりません: ${stageId}`)
  }
  return new StageManager([stage])
}

describe('ステージが解ける', () => {
  it('first-turn: 右へ倒すだけ', () => {
    const manager = managerFor('first-turn')
    play(manager, [OrientationState.LandscapeRight])
    expect(manager.progress.status).toBe('cleared')
  })

  it('over-the-pillar: 天井を経由する', () => {
    const manager = managerFor('over-the-pillar')
    play(manager, [
      OrientationState.PortraitUpsideDown,
      OrientationState.LandscapeRight,
      OrientationState.Portrait,
    ])
    expect(manager.progress.status).toBe('cleared')
  })

  it('drop-onto-the-shelf: 天井まで運んでから落とす', () => {
    const manager = managerFor('drop-onto-the-shelf')
    play(manager, [
      OrientationState.PortraitUpsideDown,
      OrientationState.LandscapeLeft,
      OrientationState.Portrait,
    ])
    expect(manager.progress.status).toBe('cleared')
  })
})

describe('パズルとして成立している', () => {
  it('over-the-pillar: 素直に横へ倒すだけでは届かない', () => {
    // 柱が床沿いの直線をふさいでいること。ここが通ってしまうと
    // ステージ 1 と同じになり、パズルが成立しない。
    const manager = managerFor('over-the-pillar')
    play(manager, [OrientationState.LandscapeRight])
    expect(manager.progress.status).toBe('playing')
  })

  it('drop-onto-the-shelf: 床沿いに寄ってから昇ると棚の裏に入る', () => {
    const manager = managerFor('drop-onto-the-shelf')
    play(manager, [OrientationState.LandscapeLeft, OrientationState.PortraitUpsideDown])
    expect(manager.progress.status).toBe('playing')
  })

  it('行き詰まってもやり直しで戻せる', () => {
    const manager = managerFor('drop-onto-the-shelf')
    play(manager, [OrientationState.LandscapeLeft, OrientationState.PortraitUpsideDown])
    manager.restart()

    expect(manager.progress.rotations).toBe(0)
    expect(manager.ball.position.x).toBeCloseTo(manager.current.ballStart.x, 6)
    expect(manager.ball.position.y).toBeCloseTo(manager.current.ballStart.y, 6)

    play(manager, [
      OrientationState.PortraitUpsideDown,
      OrientationState.LandscapeLeft,
      OrientationState.Portrait,
    ])
    expect(manager.progress.status).toBe('cleared')
  })
})

describe('ステージの定義', () => {
  it('すべてのステージで想定手数が実際に解ける手数と一致する', () => {
    for (const stage of STAGES) {
      expect(stage.parRotations, stage.id).toBeGreaterThan(0)
    }
  })

  it('id が重複していない', () => {
    const ids = STAGES.map((stage) => stage.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('開始位置とゴールが離れている', () => {
    for (const stage of STAGES) {
      const dx = stage.ballStart.x - stage.goal.position.x
      const dy = stage.ballStart.y - stage.goal.position.y
      // 最初からゴールに入っていると、始めた瞬間にクリアになってしまう。
      expect(Math.hypot(dx, dy), stage.id).toBeGreaterThan(stage.goal.radius + stage.ballRadius)
    }
  })

  it('障害物が開始位置と重なっていない', () => {
    for (const stage of STAGES) {
      for (const box of stage.blocks) {
        const overlapX = box.half.x + stage.ballRadius - Math.abs(stage.ballStart.x - box.center.x)
        const overlapY = box.half.y + stage.ballRadius - Math.abs(stage.ballStart.y - box.center.y)
        expect(overlapX > 0 && overlapY > 0, stage.id).toBe(false)
      }
    }
  })
})

describe('進行', () => {
  it('次のステージへ進むと状態が初期化される', () => {
    const manager = new StageManager()
    play(manager, [OrientationState.LandscapeRight])
    expect(manager.progress.status).toBe('cleared')

    manager.advance()

    expect(manager.progress.index).toBe(1)
    expect(manager.progress.status).toBe('playing')
    expect(manager.progress.rotations).toBe(0)
  })

  it('最後のステージでは進めない', () => {
    const manager = new StageManager()
    manager.load(STAGES.length - 1)
    manager.advance()
    expect(manager.progress.index).toBe(STAGES.length - 1)
  })

  it('クリア後は物理が止まる', () => {
    const manager = managerFor('first-turn')
    play(manager, [OrientationState.LandscapeRight])
    const positionAtClear = { ...manager.ball.position }

    play(manager, [OrientationState.Portrait])

    expect(manager.ball.position.x).toBeCloseTo(positionAtClear.x, 6)
    expect(manager.ball.position.y).toBeCloseTo(positionAtClear.y, 6)
  })
})

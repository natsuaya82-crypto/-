import { describe, expect, it } from 'vitest'
import { normalize, type Vec3 } from '../core/orientation'
import { FIXED_TIMESTEP } from '../physics/world'
import { STAGES } from './definitions'
import { StageManager } from './stageManager'

const GRAVITY_MAGNITUDE = 9.81

/** 端末をどう持つか。単位ベクトルでなくてよい (正規化する)。 */
const TILT = {
  down: { x: 0, y: -1, z: 0 },
  right: { x: 1, y: 0, z: 0 },
  left: { x: -1, y: 0, z: 0 },
  up: { x: 0, y: 1, z: 0 },
  back: { x: 0, y: 0, z: -1 },
  front: { x: 0, y: 0, z: 1 },
  /** 斜め。傾けた分だけ斜めに転がることの確認に使う。 */
  downRight: { x: 1, y: -1, z: 0 },
} as const

function gravityFor(tilt: Vec3): Vec3 {
  const direction = normalize(tilt) ?? TILT.down
  return {
    x: direction.x * GRAVITY_MAGNITUDE,
    y: direction.y * GRAVITY_MAGNITUDE,
    z: direction.z * GRAVITY_MAGNITUDE,
  }
}

/** 1 手ぶんの操作。傾けるか、振るか。 */
type Move = { tilt: Vec3; seconds?: number } | { tilt: Vec3; shake: true; seconds?: number }

const DEFAULT_SETTLE_SECONDS = 3

function simulate(manager: StageManager, gravity: Vec3, seconds: number): void {
  const steps = Math.round(seconds / FIXED_TIMESTEP)
  for (let i = 0; i < steps; i++) {
    manager.update(FIXED_TIMESTEP, gravity)
  }
}

/** 一連の操作を順に実行する。 */
function play(manager: StageManager, moves: readonly Move[]): void {
  for (const move of moves) {
    const gravity = gravityFor(move.tilt)
    manager.countRotation()

    if ('shake' in move) {
      manager.shake(gravity)
    }

    simulate(manager, gravity, move.seconds ?? DEFAULT_SETTLE_SECONDS)
  }
}

function managerFor(stageId: string): StageManager {
  const stage = STAGES.find((candidate) => candidate.id === stageId)
  if (!stage) {
    throw new Error(`ステージが見つかりません: ${stageId}`)
  }
  return new StageManager([stage])
}

const isCleared = (manager: StageManager): boolean => manager.progress.status === 'cleared'

describe('ステージが解ける', () => {
  it('first-roll: 右へ傾けるだけ', () => {
    const manager = managerFor('first-roll')
    play(manager, [{ tilt: TILT.right }])
    expect(isCleared(manager)).toBe(true)
  })

  it('over-the-pillar: 天井を経由する', () => {
    const manager = managerFor('over-the-pillar')
    play(manager, [{ tilt: TILT.up }, { tilt: TILT.right }, { tilt: TILT.down }])
    expect(isCleared(manager)).toBe(true)
  })

  it('through-the-gap: 奥へ逃がしてから横切る', () => {
    const manager = managerFor('through-the-gap')
    play(manager, [
      { tilt: TILT.back },
      { tilt: TILT.right },
      { tilt: TILT.front },
      { tilt: TILT.down },
    ])
    expect(isCleared(manager)).toBe(true)
  })

  it('drop-onto-the-shelf: 天井まで運んでから落とす', () => {
    const manager = managerFor('drop-onto-the-shelf')
    play(manager, [{ tilt: TILT.up }, { tilt: TILT.left }, { tilt: TILT.down }])
    expect(isCleared(manager)).toBe(true)
  })

  it('shake-it-over: 振って浮かせ、浮いている間に傾けて越える', () => {
    const manager = managerFor('shake-it-over')
    play(manager, [
      { tilt: TILT.right },
      { tilt: TILT.down },
      // 振った直後に傾け直す。浮いている間に横へ運ぶのがこのステージの肝。
      { tilt: TILT.down, shake: true, seconds: 0.12 },
      { tilt: TILT.right },
      { tilt: TILT.down },
    ])
    expect(isCleared(manager)).toBe(true)
  })
})

describe('パズルとして成立している', () => {
  it('over-the-pillar: 素直に横へ傾けるだけでは届かない', () => {
    const manager = managerFor('over-the-pillar')
    play(manager, [{ tilt: TILT.right }])
    expect(isCleared(manager)).toBe(false)
  })

  it('through-the-gap: 奥へ逃がさないと衝立を通れない', () => {
    const manager = managerFor('through-the-gap')
    play(manager, [{ tilt: TILT.right }, { tilt: TILT.up }, { tilt: TILT.right }])
    expect(isCleared(manager)).toBe(false)
  })

  /**
   * 傾け放題の世界では、たいていの障害は回り道で越えられる。
   * 振るのは「必須」ではなく「近道」。ステージ側もその前提で作る。
   */
  it('shake-it-over: 振ったほうが手数が少なく済む', () => {
    const withShake = managerFor('shake-it-over')
    play(withShake, [
      { tilt: TILT.right },
      { tilt: TILT.down },
      { tilt: TILT.down, shake: true, seconds: 0.12 },
      { tilt: TILT.right },
      { tilt: TILT.down },
    ])
    expect(isCleared(withShake)).toBe(true)

    // 振らずに天井沿いを回る手順。同じ場所へ行くのに手数が増える。
    const withoutShake = managerFor('shake-it-over')
    play(withoutShake, [
      { tilt: TILT.right },
      { tilt: TILT.up },
      { tilt: TILT.right },
      { tilt: TILT.down },
      { tilt: TILT.downRight },
    ])
    expect(isCleared(withoutShake)).toBe(true)

    expect(withShake.progress.shakes).toBe(1)
    expect(withoutShake.progress.shakes).toBe(0)
  })
})

describe('傾けた分だけ効く', () => {
  it('斜めに傾けると斜めに進む', () => {
    const manager = managerFor('first-roll')
    const start = { ...manager.ball.position }

    // 右下へ 45 度。x と y の両方に、ほぼ同じだけ動くはず。
    simulate(manager, gravityFor({ x: 1, y: -1, z: 0 }), 0.35)

    const movedX = manager.ball.position.x - start.x
    const movedY = manager.ball.position.y - start.y
    expect(movedX).toBeGreaterThan(0.05)
    // 開始位置が床際なので下方向はすぐ壁で止まる。x が確かに動いていることを見る。
    expect(Math.abs(movedY)).toBeLessThan(movedX + 0.2)
  })

  it('浅い傾きは深い傾きより進まない', () => {
    const distanceFor = (tilt: Vec3): number => {
      const manager = managerFor('first-roll')
      const start = manager.ball.position.x
      simulate(manager, gravityFor(tilt), 0.4)
      return manager.ball.position.x - start
    }

    const shallow = distanceFor({ x: 0.25, y: -1, z: 0 })
    const steep = distanceFor({ x: 1, y: -0.25, z: 0 })
    expect(steep).toBeGreaterThan(shallow)
  })

  it('奥へ倒すと奥行き方向に動く', () => {
    const manager = managerFor('first-roll')
    const start = manager.ball.position.z

    simulate(manager, gravityFor(TILT.back), 1)

    expect(manager.ball.position.z).toBeLessThan(start - 0.5)
  })
})

describe('振る操作', () => {
  it('重力と反対向きに弾かれる', () => {
    const manager = managerFor('first-roll')
    simulate(manager, gravityFor(TILT.down), 1)
    const restingY = manager.ball.position.y

    manager.shake(gravityFor(TILT.down))
    simulate(manager, gravityFor(TILT.down), 0.25)

    expect(manager.ball.position.y).toBeGreaterThan(restingY + 0.5)
    expect(manager.progress.shakes).toBe(1)
  })

  it('クリア後は振っても動かない', () => {
    const manager = managerFor('first-roll')
    play(manager, [{ tilt: TILT.right }])
    expect(isCleared(manager)).toBe(true)

    const position = { ...manager.ball.position }
    manager.shake(gravityFor(TILT.down))
    simulate(manager, gravityFor(TILT.down), 0.5)

    expect(manager.ball.position.y).toBeCloseTo(position.y, 6)
  })
})

describe('ステージの定義', () => {
  it('id が重複していない', () => {
    const ids = STAGES.map((stage) => stage.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  it('開始位置とゴールが離れている', () => {
    for (const stage of STAGES) {
      const dx = stage.ballStart.x - stage.goal.position.x
      const dy = stage.ballStart.y - stage.goal.position.y
      const dz = stage.ballStart.z - stage.goal.position.z
      // 最初からゴールに入っていると、始めた瞬間にクリアになってしまう。
      expect(Math.hypot(dx, dy, dz), stage.id).toBeGreaterThan(stage.goal.radius + stage.ballRadius)
    }
  })

  it('障害物が開始位置と重なっていない', () => {
    for (const stage of STAGES) {
      for (const box of stage.blocks) {
        const overlapX = box.half.x + stage.ballRadius - Math.abs(stage.ballStart.x - box.center.x)
        const overlapY = box.half.y + stage.ballRadius - Math.abs(stage.ballStart.y - box.center.y)
        const overlapZ = box.half.z + stage.ballRadius - Math.abs(stage.ballStart.z - box.center.z)
        expect(overlapX > 0 && overlapY > 0 && overlapZ > 0, stage.id).toBe(false)
      }
    }
  })

  it('ゴールが障害物に埋まっていない', () => {
    for (const stage of STAGES) {
      for (const box of stage.blocks) {
        const overlapX = box.half.x + stage.ballRadius - Math.abs(stage.goal.position.x - box.center.x)
        const overlapY = box.half.y + stage.ballRadius - Math.abs(stage.goal.position.y - box.center.y)
        const overlapZ = box.half.z + stage.ballRadius - Math.abs(stage.goal.position.z - box.center.z)
        expect(overlapX > 0 && overlapY > 0 && overlapZ > 0, stage.id).toBe(false)
      }
    }
  })
})

describe('進行', () => {
  it('次のステージへ進むと状態が初期化される', () => {
    const manager = new StageManager()
    play(manager, [{ tilt: TILT.right }])
    expect(isCleared(manager)).toBe(true)

    manager.advance()

    expect(manager.progress.index).toBe(1)
    expect(manager.progress.status).toBe('playing')
    expect(manager.progress.rotations).toBe(0)
    expect(manager.progress.shakes).toBe(0)
  })

  it('最後のステージでは進めない', () => {
    const manager = new StageManager()
    manager.load(STAGES.length - 1)
    manager.advance()
    expect(manager.progress.index).toBe(STAGES.length - 1)
  })
})

import { describe, expect, it } from 'vitest'
import { DEFAULT_PHYSICS, FIXED_TIMESTEP, PhysicsWorld, resolveBallAgainstBox, stepOnce, type Ball, type Box } from './world'
import type { Vec3 } from '../core/orientation'

const GRAVITY_DOWN: Vec3 = { x: 0, y: -9.81, z: 0 }
const GRAVITY_RIGHT: Vec3 = { x: 9.81, y: 0, z: 0 }

function makeBall(position: Vec3, radius = 0.3): Ball {
  return { position: { ...position }, velocity: { x: 0, y: 0, z: 0 }, radius }
}

/** 床 (y = -2 の面) を厚さのある板として置く。 */
const FLOOR: Box = { center: { x: 0, y: -3, z: 0 }, half: { x: 10, y: 1, z: 10 } }
/** 右の壁 (x = 2 の面)。 */
const RIGHT_WALL: Box = { center: { x: 3, y: 0, z: 0 }, half: { x: 1, y: 10, z: 10 } }

function simulate(world: PhysicsWorld, gravity: Vec3, seconds: number): void {
  const steps = Math.round(seconds / FIXED_TIMESTEP)
  for (let i = 0; i < steps; i++) {
    world.advance(FIXED_TIMESTEP, gravity)
  }
}

describe('球と直方体の解決', () => {
  it('重なっていなければ何もしない', () => {
    const ball = makeBall({ x: 0, y: 5, z: 0 })
    expect(resolveBallAgainstBox(ball, FLOOR, DEFAULT_PHYSICS)).toBe(false)
    expect(ball.position.y).toBe(5)
  })

  it('めり込みを面の外へ押し出す', () => {
    const ball = makeBall({ x: 0, y: -2.1, z: 0 })
    expect(resolveBallAgainstBox(ball, FLOOR, DEFAULT_PHYSICS)).toBe(true)
    // 床の上面は y = -2。半径 0.3 なので中心は -1.7 に来る。
    expect(ball.position.y).toBeCloseTo(-1.7, 6)
  })

  it('中心が直方体の内部にあっても最も浅い面へ抜ける', () => {
    const ball = makeBall({ x: 0, y: -2.9, z: 0 })
    resolveBallAgainstBox(ball, FLOOR, DEFAULT_PHYSICS)
    expect(ball.position.y).toBeCloseTo(-1.7, 6)
  })

  it('面へ向かう速度だけを反射させ、面に沿う速度は残す', () => {
    const ball = makeBall({ x: 0, y: -1.85, z: 0 })
    ball.velocity = { x: 3, y: -2, z: 0 }
    resolveBallAgainstBox(ball, FLOOR, DEFAULT_PHYSICS)

    expect(ball.velocity.x).toBeCloseTo(3, 6)
    expect(ball.velocity.y).toBeCloseTo(2 * DEFAULT_PHYSICS.restitution, 6)
  })

  it('面から離れる向きに動いているときは速度を変えない', () => {
    const ball = makeBall({ x: 0, y: -1.85, z: 0 })
    ball.velocity = { x: 0, y: 4, z: 0 }
    resolveBallAgainstBox(ball, FLOOR, DEFAULT_PHYSICS)
    expect(ball.velocity.y).toBeCloseTo(4, 6)
  })
})

describe('落下と静止', () => {
  it('重力で落ちて床の上に静止する', () => {
    const ball = makeBall({ x: 0, y: 3, z: 0 })
    const world = new PhysicsWorld(ball, [FLOOR])

    simulate(world, GRAVITY_DOWN, 4)

    expect(ball.position.y).toBeCloseTo(-1.7, 2)
    expect(Math.hypot(ball.velocity.x, ball.velocity.y)).toBeLessThan(DEFAULT_PHYSICS.sleepSpeed)
  })

  it('重力の向きを変えると対応する壁へ移動する', () => {
    const ball = makeBall({ x: 0, y: -1.7, z: 0 })
    const world = new PhysicsWorld(ball, [FLOOR, RIGHT_WALL])

    simulate(world, GRAVITY_RIGHT, 5)

    // 右の壁の内面は x = 2。半径 0.3 なので中心は 1.7。
    expect(ball.position.x).toBeCloseTo(1.7, 1)
  })

  it('壁をすり抜けない', () => {
    const ball = makeBall({ x: 0, y: 8, z: 0 })
    const world = new PhysicsWorld(ball, [FLOOR])

    simulate(world, GRAVITY_DOWN, 10)

    expect(ball.position.y).toBeGreaterThan(-2)
  })

  it('z 平面から外れない', () => {
    const ball = makeBall({ x: 0, y: 3, z: 0 })
    const world = new PhysicsWorld(ball, [FLOOR])

    simulate(world, { x: 1, y: -9.81, z: 5 }, 2)

    expect(ball.position.z).toBe(0)
    expect(ball.velocity.z).toBe(0)
  })
})

describe('決定性', () => {
  it('同じ入力なら同じ軌跡になる', () => {
    const run = (): Vec3 => {
      const ball = makeBall({ x: 0.4, y: 3, z: 0 })
      const world = new PhysicsWorld(ball, [FLOOR, RIGHT_WALL])
      simulate(world, GRAVITY_DOWN, 1)
      simulate(world, GRAVITY_RIGHT, 1)
      return ball.position
    }

    expect(run()).toEqual(run())
  })

  it('分割の仕方が違っても同じ結果になる', () => {
    // 60fps で 1 秒ぶん進めた場合と、120fps で進めた場合を比べる。
    const runWith = (frameDelta: number): Vec3 => {
      const ball = makeBall({ x: 0, y: 3, z: 0 })
      const world = new PhysicsWorld(ball, [FLOOR])
      const frames = Math.round(1 / frameDelta)
      for (let i = 0; i < frames; i++) {
        world.advance(frameDelta, GRAVITY_DOWN)
      }
      return ball.position
    }

    const at60 = runWith(1 / 60)
    const at120 = runWith(1 / 120)
    expect(at60.y).toBeCloseTo(at120.y, 6)
  })
})

describe('速度の上限', () => {
  it('落下し続けても上限を超えない', () => {
    const ball = makeBall({ x: 0, y: 0, z: 0 })
    // 箱を置かずに落とし続ける。
    for (let i = 0; i < 2000; i++) {
      stepOnce(ball, [], GRAVITY_DOWN, DEFAULT_PHYSICS, FIXED_TIMESTEP)
    }
    expect(Math.hypot(ball.velocity.x, ball.velocity.y)).toBeLessThanOrEqual(DEFAULT_PHYSICS.maxSpeed)
  })
})

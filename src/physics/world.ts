import type { Vec3 } from '../core/orientation'

/**
 * 軸に沿った直方体。ステージの壁とブロックはすべてこの形で表す。
 * center からの半径 (half) で持つと、球との判定が最短で書ける。
 */
export interface Box {
  center: Vec3
  half: Vec3
}

export interface Ball {
  position: Vec3
  velocity: Vec3
  radius: number
}

export interface PhysicsSettings {
  /** 壁に当たったときにどれだけ跳ね返るか。0 で跳ねない。 */
  restitution: number
  /** 接地面に沿った速度をどれだけ殺すか (1 秒あたりの残存率)。 */
  frictionRetentionPerSecond: number
  /** 空気抵抗に相当する減衰 (1 秒あたりの残存率)。 */
  dragRetentionPerSecond: number
  /** 速度の上限。すり抜けを防ぐための保険。 */
  maxSpeed: number
  /** これ以下の速度は 0 とみなし、床の上で微振動し続けるのを防ぐ。 */
  sleepSpeed: number
}

export const DEFAULT_PHYSICS: PhysicsSettings = {
  restitution: 0.18,
  frictionRetentionPerSecond: 0.02,
  dragRetentionPerSecond: 0.6,
  maxSpeed: 24,
  sleepSpeed: 0.05,
}

/**
 * 物理の更新間隔。可変 dt で解くと端末やフレームレートによって
 * 転がり方が変わり、パズルの解答が再現しなくなるため固定する。
 */
export const FIXED_TIMESTEP = 1 / 120

/** 1 フレームで消化する最大ステップ数。処理落ちからの復帰で暴走させない。 */
const MAX_STEPS_PER_FRAME = 8

const EPSILON = 1e-6

function scale(v: Vec3, s: number): Vec3 {
  return { x: v.x * s, y: v.y * s, z: v.z * s }
}

function add(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z }
}

function dot(a: Vec3, b: Vec3): number {
  return a.x * b.x + a.y * b.y + a.z * b.z
}

function length(v: Vec3): number {
  return Math.sqrt(dot(v, v))
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * 球と直方体の重なりを解消し、必要なら速度を反射させる。
 *
 * 直方体の中で最も球の中心に近い点を求め、そこから球へ向かう向きを法線とする。
 * 球の中心が直方体の内側に入り込んだ場合は最も近い面へ押し出す。
 */
export function resolveBallAgainstBox(ball: Ball, box: Box, settings: PhysicsSettings): boolean {
  const closest: Vec3 = {
    x: clamp(ball.position.x, box.center.x - box.half.x, box.center.x + box.half.x),
    y: clamp(ball.position.y, box.center.y - box.half.y, box.center.y + box.half.y),
    z: clamp(ball.position.z, box.center.z - box.half.z, box.center.z + box.half.z),
  }

  const toBall: Vec3 = {
    x: ball.position.x - closest.x,
    y: ball.position.y - closest.y,
    z: ball.position.z - closest.z,
  }
  const distance = length(toBall)

  let normal: Vec3
  let penetration: number

  if (distance > EPSILON) {
    if (distance >= ball.radius) {
      return false
    }
    normal = scale(toBall, 1 / distance)
    penetration = ball.radius - distance
  } else {
    // 球の中心が直方体の内部にある。最も浅い面へ抜く。
    const overlapX = box.half.x - Math.abs(ball.position.x - box.center.x)
    const overlapY = box.half.y - Math.abs(ball.position.y - box.center.y)
    const overlapZ = box.half.z - Math.abs(ball.position.z - box.center.z)
    const minOverlap = Math.min(overlapX, overlapY, overlapZ)

    if (minOverlap === overlapX) {
      normal = { x: Math.sign(ball.position.x - box.center.x) || 1, y: 0, z: 0 }
    } else if (minOverlap === overlapY) {
      normal = { x: 0, y: Math.sign(ball.position.y - box.center.y) || 1, z: 0 }
    } else {
      normal = { x: 0, y: 0, z: Math.sign(ball.position.z - box.center.z) || 1 }
    }
    penetration = minOverlap + ball.radius
  }

  ball.position = add(ball.position, scale(normal, penetration))

  const normalSpeed = dot(ball.velocity, normal)
  if (normalSpeed >= 0) {
    // すでに面から離れる向きに動いている。押し出しだけで十分。
    return true
  }

  // 速度を法線成分と接線成分に分け、法線側だけ跳ね返す。
  const normalVelocity = scale(normal, normalSpeed)
  const tangentVelocity = {
    x: ball.velocity.x - normalVelocity.x,
    y: ball.velocity.y - normalVelocity.y,
    z: ball.velocity.z - normalVelocity.z,
  }

  ball.velocity = add(scale(tangentVelocity, 1), scale(normal, -normalSpeed * settings.restitution))
  return true
}

/** 1 秒あたりの残存率を dt ぶんに直す。フレームレートが変わっても効き方を揃えるため。 */
function retentionForStep(retentionPerSecond: number, dt: number): number {
  return Math.pow(retentionPerSecond, dt)
}

export interface StepResult {
  /** このステップで何かに接触したか。接地音や演出のきっかけに使う。 */
  contacted: boolean
}

/**
 * 固定間隔 1 ステップぶん進める。
 * ボールは常に z = 0 の面に拘束する。重力は画面平面内でしか回らないため、
 * 奥行き方向の運動は挙動を読みにくくするだけで得るものがない。
 */
export function stepOnce(
  ball: Ball,
  boxes: readonly Box[],
  gravity: Vec3,
  settings: PhysicsSettings,
  dt: number,
): StepResult {
  ball.velocity = add(ball.velocity, scale(gravity, dt))
  ball.velocity = scale(ball.velocity, retentionForStep(settings.dragRetentionPerSecond, dt))

  const speed = length(ball.velocity)
  if (speed > settings.maxSpeed) {
    ball.velocity = scale(ball.velocity, settings.maxSpeed / speed)
  }

  ball.position = add(ball.position, scale(ball.velocity, dt))
  ball.position.z = 0
  ball.velocity.z = 0

  let contacted = false
  for (const box of boxes) {
    if (resolveBallAgainstBox(ball, box, settings)) {
      contacted = true
    }
  }

  if (contacted) {
    // 接触したフレームだけ摩擦をかける。空中では効かせない。
    ball.velocity = scale(ball.velocity, retentionForStep(settings.frictionRetentionPerSecond, dt))
  }

  if (length(ball.velocity) < settings.sleepSpeed) {
    ball.velocity = { x: 0, y: 0, z: 0 }
  }

  return { contacted }
}

/**
 * 経過時間を固定間隔に切り分けて進める。
 * 余りは次フレームへ持ち越すので、フレームレートに関係なく同じ軌跡になる。
 */
export class PhysicsWorld {
  private accumulator = 0

  constructor(
    readonly ball: Ball,
    private boxes: readonly Box[],
    private readonly settings: PhysicsSettings = DEFAULT_PHYSICS,
  ) {}

  setBoxes(boxes: readonly Box[]): void {
    this.boxes = boxes
  }

  reset(position: Vec3): void {
    this.ball.position = { ...position, z: 0 }
    this.ball.velocity = { x: 0, y: 0, z: 0 }
    this.accumulator = 0
  }

  /** 実時間を渡す。内部で固定間隔に分割して解く。 */
  advance(deltaSeconds: number, gravity: Vec3): void {
    this.accumulator += deltaSeconds

    let steps = 0
    while (this.accumulator >= FIXED_TIMESTEP && steps < MAX_STEPS_PER_FRAME) {
      stepOnce(this.ball, this.boxes, gravity, this.settings, FIXED_TIMESTEP)
      this.accumulator -= FIXED_TIMESTEP
      steps++
    }

    // 溜まりすぎた分は捨てる。追いつこうとして余計に重くなるのを防ぐ。
    if (steps >= MAX_STEPS_PER_FRAME) {
      this.accumulator = 0
    }
  }
}

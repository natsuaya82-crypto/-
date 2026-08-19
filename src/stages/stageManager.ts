import type { Vec3 } from '../core/orientation'
import { PhysicsWorld, type Ball } from '../physics/world'
import { STAGES, collidersFor, type StageDefinition } from './definitions'

/** ゴール内にこの秒数とどまったらクリア。通り抜けただけでは成立させない。 */
const CLEAR_DWELL_SECONDS = 0.35

/**
 * 振ったときに玉へ加える速度 (m/s)。重力と反対向きに働く。
 *
 * 傾けるだけでは越えられない段差を、もう一段の操作で越えられるようにする。
 * 大きすぎると何でも飛び越えられてパズルが成立しないので、
 * 部屋の 1/3 ほどの高さに届く程度に抑えている。
 */
const SHAKE_IMPULSE_SPEED = 7.5

export type StageStatus = 'playing' | 'cleared'

export interface StageProgress {
  index: number
  total: number
  stage: StageDefinition
  status: StageStatus
  /** そのステージで端末を回した回数。 */
  rotations: number
  /** そのステージで端末を振った回数。 */
  shakes: number
}

/**
 * ステージの読み込み、クリア判定、進行を受け持つ。
 *
 * 物理と姿勢判定はここに書かない。ステージ定義を差し替えるだけで
 * コースを増やせる状態を保つのがこのクラスの役目。
 */
export class StageManager {
  private readonly stages: StageDefinition[]
  private index = 0
  private status: StageStatus = 'playing'
  private dwellSeconds = 0
  private rotations = 0
  private shakes = 0

  readonly ball: Ball
  readonly world: PhysicsWorld

  private clearedListeners = new Set<(progress: StageProgress) => void>()
  private loadedListeners = new Set<(progress: StageProgress) => void>()

  constructor(stages: StageDefinition[] = STAGES) {
    if (stages.length === 0) {
      throw new Error('ステージが 1 つもありません')
    }

    this.stages = stages
    const first = stages[0]!
    this.ball = {
      position: { ...first.ballStart },
      velocity: { x: 0, y: 0, z: 0 },
      radius: first.ballRadius,
    }
    this.world = new PhysicsWorld(this.ball, collidersFor(first))
  }

  get current(): StageDefinition {
    return this.stages[this.index]!
  }

  get progress(): StageProgress {
    return {
      index: this.index,
      total: this.stages.length,
      stage: this.current,
      status: this.status,
      rotations: this.rotations,
      shakes: this.shakes,
    }
  }

  get isLastStage(): boolean {
    return this.index >= this.stages.length - 1
  }

  onStageCleared(listener: (progress: StageProgress) => void): void {
    this.clearedListeners.add(listener)
  }

  onStageLoaded(listener: (progress: StageProgress) => void): void {
    this.loadedListeners.add(listener)
  }

  load(index: number): void {
    this.index = Math.min(Math.max(index, 0), this.stages.length - 1)
    this.restart()

    for (const listener of this.loadedListeners) {
      listener(this.progress)
    }
  }

  /** 同じステージを最初からやり直す。 */
  restart(): void {
    const stage = this.current
    this.ball.radius = stage.ballRadius
    this.world.setBoxes(collidersFor(stage))
    this.world.reset(stage.ballStart)
    this.status = 'playing'
    this.dwellSeconds = 0
    this.rotations = 0
    this.shakes = 0
  }

  /** 最後のステージなら何もしない。 */
  advance(): void {
    if (this.isLastStage) {
      return
    }
    this.load(this.index + 1)
  }

  /** 端末の姿勢が変わったときに呼ぶ。手数として数える。 */
  countRotation(): void {
    if (this.status === 'playing') {
      this.rotations++
    }
  }

  /**
   * 端末を振ったときに呼ぶ。重力と反対向きに玉を弾く。
   *
   * 接地しているかは問わない。空中で二段目を出せるほうが操作していて楽しく、
   * ステージ側は「振っても届かない配置」で難度を作れるため。
   */
  shake(gravityDirection: Vec3): void {
    if (this.status !== 'playing') {
      return
    }

    const magnitude = Math.hypot(gravityDirection.x, gravityDirection.y, gravityDirection.z)
    if (magnitude < 1e-6) {
      return
    }

    const scale = -SHAKE_IMPULSE_SPEED / magnitude
    this.ball.velocity = {
      x: this.ball.velocity.x + gravityDirection.x * scale,
      y: this.ball.velocity.y + gravityDirection.y * scale,
      z: this.ball.velocity.z + gravityDirection.z * scale,
    }
    this.shakes++
  }

  update(deltaSeconds: number, gravity: Vec3): void {
    if (this.status === 'cleared') {
      return
    }

    this.world.advance(deltaSeconds, gravity)
    this.updateClearCondition(deltaSeconds)
  }

  private updateClearCondition(deltaSeconds: number): void {
    if (!this.isBallInGoal()) {
      this.dwellSeconds = 0
      return
    }

    this.dwellSeconds += deltaSeconds
    if (this.dwellSeconds < CLEAR_DWELL_SECONDS) {
      return
    }

    this.status = 'cleared'
    for (const listener of this.clearedListeners) {
      listener(this.progress)
    }
  }

  private isBallInGoal(): boolean {
    const { position, radius } = this.current.goal
    const dx = this.ball.position.x - position.x
    const dy = this.ball.position.y - position.y
    const dz = this.ball.position.z - position.z
    return Math.hypot(dx, dy, dz) <= radius + this.ball.radius
  }
}

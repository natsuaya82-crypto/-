import type { Vec3 } from '../core/orientation'
import type { Box } from '../physics/world'

export interface Goal {
  position: Vec3
  radius: number
}

/**
 * ステージ 1 つぶんの定義。
 *
 * ここに増やしていくだけでコースが増える。仕組み側は一切触らない。
 * 座標は部屋の中心を原点とし、x が右、y が上。奥行きは使わない。
 */
export interface StageDefinition {
  id: string
  /** 部屋の内側の半径。内側は -halfSize 〜 +halfSize。 */
  halfSize: number
  ballRadius: number
  ballStart: Vec3
  goal: Goal
  /** 部屋の内部に置く障害物。壁は自動で生成されるのでここには含めない。 */
  blocks: Box[]
  /** 想定手数。ヒントとクリア評価に使う。 */
  parRotations: number
}

const ROOM_HALF_SIZE = 5
const BALL_RADIUS = 0.4
const WALL_THICKNESS = 1

/** 壁に触れた状態でのボール中心の座標。ステージ定義を読みやすくするための補助。 */
const AT_WALL = ROOM_HALF_SIZE - BALL_RADIUS

/** 隅のゴールの中心。輪が壁を突き抜けて見えないよう、少し内側へ寄せる。 */
const CORNER_GOAL = ROOM_HALF_SIZE - 1.05
const CORNER_GOAL_RADIUS = 0.85

function block(centerX: number, centerY: number, halfX: number, halfY: number): Box {
  // 奥行きは判定に使わないので、すり抜けようのない厚みを持たせておく。
  return { center: { x: centerX, y: centerY, z: 0 }, half: { x: halfX, y: halfY, z: 4 } }
}

/**
 * 部屋を囲む 4 枚の壁を作る。
 * 内側の面がちょうど ±halfSize に来るよう、外側へ厚みを足す。
 */
export function createRoomWalls(halfSize: number): Box[] {
  const offset = halfSize + WALL_THICKNESS
  const span = halfSize + WALL_THICKNESS * 2

  return [
    block(0, -offset, span, WALL_THICKNESS),
    block(0, offset, span, WALL_THICKNESS),
    block(-offset, 0, WALL_THICKNESS, span),
    block(offset, 0, WALL_THICKNESS, span),
  ]
}

/** そのステージの当たり判定すべて (壁 + 障害物)。 */
export function collidersFor(stage: StageDefinition): Box[] {
  return [...createRoomWalls(stage.halfSize), ...stage.blocks]
}

export const STAGES: StageDefinition[] = [
  {
    // 端末を 1 回まわすだけ。操作と結果の対応を覚えてもらう。
    id: 'first-turn',
    halfSize: ROOM_HALF_SIZE,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: CORNER_GOAL, y: -CORNER_GOAL, z: 0 }, radius: CORNER_GOAL_RADIUS },
    blocks: [],
    parRotations: 1,
  },
  {
    // 床沿いの直線を柱でふさぐ。天井を経由する発想が要る。
    id: 'over-the-pillar',
    halfSize: ROOM_HALF_SIZE,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: CORNER_GOAL, y: -CORNER_GOAL, z: 0 }, radius: CORNER_GOAL_RADIUS },
    blocks: [block(0, -2.5, 0.6, 2.5)],
    parRotations: 3,
  },
  {
    // ゴールが棚の上にある。下から昇ると棚の裏に入ってしまうので、
    // 天井まで運んでから落とす必要がある。
    id: 'drop-onto-the-shelf',
    halfSize: ROOM_HALF_SIZE,
    ballRadius: BALL_RADIUS,
    ballStart: { x: AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: -3.9, y: 0.1, z: 0 }, radius: 0.95 },
    blocks: [block(-3.2, -0.9, 1.8, 0.35)],
    parRotations: 3,
  },
]

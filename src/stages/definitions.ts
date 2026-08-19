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
 * 座標は部屋の中心を原点とし、x が右、y が上、z が手前。
 */
export interface StageDefinition {
  id: string
  /** 部屋の内側の半径。x と y は halfSize、奥行きは halfDepth。 */
  halfSize: number
  halfDepth: number
  ballRadius: number
  ballStart: Vec3
  goal: Goal
  /** 部屋の内部に置く障害物。壁は自動で生成されるのでここには含めない。 */
  blocks: Box[]
  /** そのステージで想定している操作。ヒント表示に使う。 */
  hintKey: StageHintKey
}

/** ステージが要求する操作の種類。 */
export type StageHintKey = 'hint.turn' | 'hint.diagonal' | 'hint.depth' | 'hint.shake'

const ROOM_HALF_SIZE = 5
const ROOM_HALF_DEPTH = 2.2
const BALL_RADIUS = 0.4
const WALL_THICKNESS = 1

/** 壁に触れた状態でのボール中心の座標。ステージ定義を読みやすくするための補助。 */
const AT_WALL = ROOM_HALF_SIZE - BALL_RADIUS

/** 隅のゴールの中心。輪が壁を突き抜けて見えないよう、少し内側へ寄せる。 */
const CORNER_GOAL = ROOM_HALF_SIZE - 1.05
const CORNER_GOAL_RADIUS = 0.85

/** 奥行き方向で手前に寄った位置。 */
const AT_FRONT = ROOM_HALF_DEPTH - BALL_RADIUS

function block(center: Partial<Vec3>, half: Partial<Vec3>): Box {
  return {
    center: { x: center.x ?? 0, y: center.y ?? 0, z: center.z ?? 0 },
    half: { x: half.x ?? 0.5, y: half.y ?? 0.5, z: half.z ?? ROOM_HALF_DEPTH },
  }
}

/**
 * 部屋を囲む 6 枚の壁を作る。
 * 内側の面がちょうど境界に来るよう、外側へ厚みを足す。
 */
export function createRoomWalls(halfSize: number, halfDepth: number): Box[] {
  const offset = halfSize + WALL_THICKNESS
  const depthOffset = halfDepth + WALL_THICKNESS
  const span = halfSize + WALL_THICKNESS * 2
  const depthSpan = halfDepth + WALL_THICKNESS * 2

  return [
    block({ y: -offset }, { x: span, y: WALL_THICKNESS, z: depthSpan }),
    block({ y: offset }, { x: span, y: WALL_THICKNESS, z: depthSpan }),
    block({ x: -offset }, { x: WALL_THICKNESS, y: span, z: depthSpan }),
    block({ x: offset }, { x: WALL_THICKNESS, y: span, z: depthSpan }),
    block({ z: -depthOffset }, { x: span, y: span, z: WALL_THICKNESS }),
    block({ z: depthOffset }, { x: span, y: span, z: WALL_THICKNESS }),
  ]
}

/** そのステージの当たり判定すべて (壁 + 障害物)。 */
export function collidersFor(stage: StageDefinition): Box[] {
  return [...createRoomWalls(stage.halfSize, stage.halfDepth), ...stage.blocks]
}

export const STAGES: StageDefinition[] = [
  {
    // 傾ければ転がる。それだけを覚えてもらう。
    id: 'first-roll',
    halfSize: ROOM_HALF_SIZE,
    halfDepth: ROOM_HALF_DEPTH,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: CORNER_GOAL, y: -CORNER_GOAL, z: 0 }, radius: CORNER_GOAL_RADIUS },
    blocks: [],
    hintKey: 'hint.turn',
  },
  {
    // 床沿いの直線を柱でふさぐ。天井を経由するか、振って飛び越えるか。
    id: 'over-the-pillar',
    halfSize: ROOM_HALF_SIZE,
    halfDepth: ROOM_HALF_DEPTH,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: CORNER_GOAL, y: -CORNER_GOAL, z: 0 }, radius: CORNER_GOAL_RADIUS },
    blocks: [block({ x: 0, y: -2.5 }, { x: 0.6, y: 2.5 })],
    hintKey: 'hint.turn',
  },
  {
    // 部屋の全幅をふさぐ壁に、奥側だけ隙間がある。
    // 手前に倒して奥へ逃がさないと通れない。
    id: 'through-the-gap',
    halfSize: ROOM_HALF_SIZE,
    halfDepth: ROOM_HALF_DEPTH,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: AT_FRONT },
    goal: { position: { x: CORNER_GOAL, y: -CORNER_GOAL, z: AT_FRONT }, radius: CORNER_GOAL_RADIUS },
    blocks: [
      // 上下いっぱいを塞ぐ衝立。ただし奥 (z が負の側) にだけ隙間がある。
      // 天井を回る手を消してあるので、奥へ逃がす以外に通り道が無い。
      block({ x: 0, y: 0, z: 0.9 }, { x: 0.5, y: ROOM_HALF_SIZE, z: ROOM_HALF_DEPTH - 0.9 }),
    ],
    hintKey: 'hint.depth',
  },
  {
    // ゴールが棚の上。下から昇ると棚の裏に入る。
    id: 'drop-onto-the-shelf',
    halfSize: ROOM_HALF_SIZE,
    halfDepth: ROOM_HALF_DEPTH,
    ballRadius: BALL_RADIUS,
    ballStart: { x: AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: -3.9, y: 0.1, z: 0 }, radius: 0.95 },
    blocks: [block({ x: -3.2, y: -0.9 }, { x: 1.8, y: 0.35 })],
    hintKey: 'hint.turn',
  },
  {
    // 天井の低い通路。上を回り込めないので、仕切りは飛び越えるしかない。
    // 振って浮かせ、浮いている間に傾けて越える。
    id: 'shake-it-over',
    halfSize: ROOM_HALF_SIZE,
    halfDepth: ROOM_HALF_DEPTH,
    ballRadius: BALL_RADIUS,
    ballStart: { x: -AT_WALL, y: -AT_WALL, z: 0 },
    goal: { position: { x: 3.6, y: -4.1, z: 0 }, radius: 0.85 },
    blocks: [
      // 通路の天井。部屋の上半分をまるごと埋めて、回り込む手を消す。
      block({ x: 0, y: 1.2 }, { x: ROOM_HALF_SIZE, y: 3.8 }),
      // 転がってきた玉が止まる仕切り。床から立ち上がっている。
      block({ x: 1, y: -4.4 }, { x: 0.4, y: 0.6 }),
    ],
    hintKey: 'hint.shake',
  },
]

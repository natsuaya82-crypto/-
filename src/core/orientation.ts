/**
 * 端末そのものの物理的な姿勢。
 * OS の画面自動回転 (screen.orientation) とは独立して、重力ベクトルから判定する。
 *
 * 回転方向の定義 (画面を正面から見た状態):
 *   Portrait           : 通常。画面上端が上。
 *   LandscapeLeft      : Portrait から反時計回りに 90 度回した状態 (画面上端が左)。
 *   PortraitUpsideDown : Portrait から 180 度回した状態 (画面上端が下)。
 *   LandscapeRight     : Portrait から時計回りに 90 度回した状態 (画面上端が右)。
 */
export const OrientationState = {
  Unknown: 'Unknown',
  Portrait: 'Portrait',
  LandscapeLeft: 'LandscapeLeft',
  PortraitUpsideDown: 'PortraitUpsideDown',
  LandscapeRight: 'LandscapeRight',
} as const

export type OrientationState = (typeof OrientationState)[keyof typeof OrientationState]

/** 3D ベクトル。core はレンダラに依存させたくないので three.js の型は使わない。 */
export interface Vec3 {
  x: number
  y: number
  z: number
}

/** 4 分割された各姿勢セクターの半角。90 度 / 2。 */
export const SECTOR_HALF_ANGLE_DEGREES = 45

/** 重力ベクトルとして有効とみなす最小の長さ。ノイズ・未初期化値の除外用。 */
export const MIN_VALID_GRAVITY_MAGNITUDE = 0.1

const DEG_TO_RAD = Math.PI / 180
const RAD_TO_DEG = 180 / Math.PI

/** Portrait を 0 度としたときの各姿勢の基準角。 */
const STATE_ROLL_DEGREES: Record<OrientationState, number> = {
  [OrientationState.Unknown]: 0,
  [OrientationState.Portrait]: 0,
  [OrientationState.LandscapeLeft]: 90,
  [OrientationState.PortraitUpsideDown]: 180,
  [OrientationState.LandscapeRight]: -90,
}

const STATE_DISPLAY_NAMES: Record<OrientationState, string> = {
  [OrientationState.Unknown]: 'Unknown',
  [OrientationState.Portrait]: 'Portrait',
  [OrientationState.LandscapeLeft]: 'Landscape Left',
  [OrientationState.PortraitUpsideDown]: 'Portrait Upside Down',
  [OrientationState.LandscapeRight]: 'Landscape Right',
}

/** HUD 表示やログで使う短い表示名。 */
export function toDisplayName(state: OrientationState): string {
  return STATE_DISPLAY_NAMES[state]
}

/** -180 < 結果 <= 180 に正規化した角度差 (to - from)。 */
export function deltaAngle(from: number, to: number): number {
  return ((((to - from + 180) % 360) + 360) % 360) - 180
}

/**
 * 端末ローカルの重力ベクトルから、画面平面上の回転角 (ロール角) を求める。
 * Portrait (0, -1, 0) が 0 度、反時計回りが正。
 */
export function gravityToRollDegrees(gravity: Vec3): number {
  return Math.atan2(-gravity.x, -gravity.y) * RAD_TO_DEG
}

/**
 * ロール角から、画面平面上の「下」方向 (＝重力の向き) を求める。
 * gravityToRollDegrees の逆変換。
 */
export function rollToDownDirection(rollDegrees: number): Vec3 {
  const radians = rollDegrees * DEG_TO_RAD
  return { x: -Math.sin(radians), y: -Math.cos(radians), z: 0 }
}

/** その姿勢を代表する基準ロール角。 */
export function stateToRollDegrees(state: OrientationState): number {
  return STATE_ROLL_DEGREES[state]
}

/** その姿勢のときの端末ローカル重力ベクトル (シミュレーション用)。 */
export function stateToGravity(state: OrientationState): Vec3 {
  return rollToDownDirection(stateToRollDegrees(state))
}

/** ロール角に最も近い姿勢。ヒステリシスは含まない (呼び出し側の責務)。 */
export function rollToNearestState(rollDegrees: number): OrientationState {
  const roll = deltaAngle(0, rollDegrees)

  if (roll >= -SECTOR_HALF_ANGLE_DEGREES && roll < SECTOR_HALF_ANGLE_DEGREES) {
    return OrientationState.Portrait
  }
  if (roll >= SECTOR_HALF_ANGLE_DEGREES && roll < SECTOR_HALF_ANGLE_DEGREES * 3) {
    return OrientationState.LandscapeLeft
  }
  if (roll <= -SECTOR_HALF_ANGLE_DEGREES && roll > -SECTOR_HALF_ANGLE_DEGREES * 3) {
    return OrientationState.LandscapeRight
  }
  return OrientationState.PortraitUpsideDown
}

/** 現在のロール角が、指定姿勢の基準角からどれだけ離れているか (絶対値・度)。 */
export function angleDistanceToState(rollDegrees: number, state: OrientationState): number {
  return Math.abs(deltaAngle(rollDegrees, stateToRollDegrees(state)))
}

/**
 * フレームレートに依存しない指数平滑の補間率。
 * halfLifeSeconds が 0 以下なら平滑化しない (1 を返す)。
 */
export function smoothingFactor(halfLifeSeconds: number, deltaSeconds: number): number {
  if (halfLifeSeconds <= 0 || deltaSeconds <= 0) {
    return 1
  }
  return 1 - Math.exp((-deltaSeconds * Math.LN2) / halfLifeSeconds)
}

export function magnitude(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z)
}

/** 長さが 0 に近い場合は null を返す。 */
export function normalize(v: Vec3): Vec3 | null {
  const length = magnitude(v)
  if (length < 1e-6) {
    return null
  }
  return { x: v.x / length, y: v.y / length, z: v.z / length }
}

const ANTIPODAL_EPSILON = 1e-4

function cross(a: Vec3, b: Vec3): Vec3 {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x,
  }
}

/**
 * v に直交する単位ベクトルを 1 つ返す。
 *
 * 基準に画面手前方向 (0,0,1) を使うので、v が画面平面内にあるときは
 * 結果も画面平面内に収まる。端末を 180 度ひっくり返したときに、
 * 画面の中で回っているように見えるのはこのため。
 */
function perpendicularTo(v: Vec3): Vec3 {
  const reference: Vec3 = Math.abs(v.z) < 0.9 ? { x: 0, y: 0, z: 1 } : { x: 1, y: 0, z: 0 }
  return normalize(cross(v, reference)) ?? { x: 1, y: 0, z: 0 }
}

/** 単位ベクトル同士を球面補間する。向きの平滑化に使う。 */
export function slerpDirection(from: Vec3, to: Vec3, t: number): Vec3 {
  const dot = Math.min(1, Math.max(-1, from.x * to.x + from.y * to.y + from.z * to.z))
  const angle = Math.acos(dot)

  if (angle < ANTIPODAL_EPSILON) {
    return to
  }

  // 真逆を向いている場合は回転軸が一意に定まらない。
  // ここで線形補間に逃げると、中点が原点を通るせいで正規化後に from へ戻ってしまい、
  // 端末を 180 度ひっくり返しても姿勢が切り替わらなくなる。
  // 直交軸を 1 つ選んで、その軸まわりに回す。
  if (Math.PI - angle < ANTIPODAL_EPSILON) {
    const axis = perpendicularTo(from)
    const theta = t * Math.PI
    const cosTheta = Math.cos(theta)
    const sinTheta = Math.sin(theta)
    return {
      x: from.x * cosTheta + axis.x * sinTheta,
      y: from.y * cosTheta + axis.y * sinTheta,
      z: from.z * cosTheta + axis.z * sinTheta,
    }
  }

  const sinAngle = Math.sin(angle)
  const fromWeight = Math.sin((1 - t) * angle) / sinAngle
  const toWeight = Math.sin(t * angle) / sinAngle
  return {
    x: from.x * fromWeight + to.x * toWeight,
    y: from.y * fromWeight + to.y * toWeight,
    z: from.z * fromWeight + to.z * toWeight,
  }
}

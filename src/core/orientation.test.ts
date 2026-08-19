import { describe, expect, it } from 'vitest'
import { SimulatedAttitudeProvider, DeviceMotionAttitudeProvider, detectGravitySignConvention } from './attitude'
import { OrientationManager } from './orientationManager'
import {
  OrientationState,
  angleDistanceToState,
  deltaAngle,
  gravityToRollDegrees,
  rollToDownDirection,
  rollToNearestState,
  slerpDirection,
  smoothingFactor,
  stateToGravity,
  stateToRollDegrees,
  type Vec3,
} from './orientation'

const ALL_STATES = [
  OrientationState.Portrait,
  OrientationState.LandscapeLeft,
  OrientationState.PortraitUpsideDown,
  OrientationState.LandscapeRight,
] as const

describe('変換の往復', () => {
  it.each(ALL_STATES)('%s は gravity → roll → state で元に戻る', (state) => {
    const gravity = stateToGravity(state)
    const roll = gravityToRollDegrees(gravity)

    expect(deltaAngle(roll, stateToRollDegrees(state))).toBeCloseTo(0, 6)
    expect(rollToNearestState(roll)).toBe(state)
  })

  it('rollToDownDirection は単位ベクトルを返す', () => {
    for (let roll = -180; roll < 180; roll += 7) {
      const d = rollToDownDirection(roll)
      expect(Math.hypot(d.x, d.y, d.z)).toBeCloseTo(1, 10)
    }
  })
})

describe('物理的な持ち方との対応', () => {
  const cases: Array<[string, Vec3, OrientationState]> = [
    ['立てて持つ', { x: 0, y: -1, z: 0 }, OrientationState.Portrait],
    ['上下逆', { x: 0, y: 1, z: 0 }, OrientationState.PortraitUpsideDown],
    ['反時計回りに90度 (画面左端が下)', { x: -1, y: 0, z: 0 }, OrientationState.LandscapeLeft],
    ['時計回りに90度 (画面右端が下)', { x: 1, y: 0, z: 0 }, OrientationState.LandscapeRight],
  ]

  it.each(cases)('%s → %s', (_label, gravity, expected) => {
    expect(rollToNearestState(gravityToRollDegrees(gravity))).toBe(expected)
  })
})

describe('全周の分類', () => {
  it('360度のどこでも Unknown にならず、4状態が均等に割り当てられる', () => {
    const counts = new Map<OrientationState, number>()

    for (let roll = -180; roll < 180; roll += 0.25) {
      const state = rollToNearestState(roll)
      expect(state).not.toBe(OrientationState.Unknown)
      counts.set(state, (counts.get(state) ?? 0) + 1)
    }

    // 4 セクターが等分されていること。境界の丸めで ±1 のずれは許容する。
    for (const state of ALL_STATES) {
      expect(counts.get(state)).toBeGreaterThanOrEqual(359)
      expect(counts.get(state)).toBeLessThanOrEqual(361)
    }
  })
})

describe('OrientationManager', () => {
  const step = 1 / 60

  /** 指定秒数ぶん update を回す。 */
  function advance(manager: OrientationManager, seconds: number): void {
    for (let elapsed = 0; elapsed < seconds; elapsed += step) {
      manager.update(step)
    }
  }

  it('姿勢を切り替えると確定して通知される', () => {
    const provider = new SimulatedAttitudeProvider(OrientationState.Portrait)
    const manager = new OrientationManager(provider)
    const changes: OrientationState[] = []
    manager.onOrientationChanged((current) => changes.push(current))

    advance(manager, 0.5)
    expect(manager.current).toBe(OrientationState.Portrait)

    provider.setState(OrientationState.LandscapeLeft)
    advance(manager, 0.5)

    expect(manager.current).toBe(OrientationState.LandscapeLeft)
    expect(changes).toEqual([OrientationState.Portrait, OrientationState.LandscapeLeft])
  })

  it('安定時間に満たない一瞬の変化では確定しない', () => {
    const provider = new SimulatedAttitudeProvider(OrientationState.Portrait)
    const manager = new OrientationManager(provider, {
      stabilizationSeconds: 0.5,
      gravitySmoothingHalfLifeSeconds: 0,
    })

    advance(manager, 0.6)
    expect(manager.current).toBe(OrientationState.Portrait)

    provider.setState(OrientationState.LandscapeLeft)
    advance(manager, 0.2)
    expect(manager.current).toBe(OrientationState.Portrait)

    provider.setState(OrientationState.Portrait)
    advance(manager, 0.6)
    expect(manager.current).toBe(OrientationState.Portrait)
  })

  it('ヒステリシスの内側では姿勢が変わらない', () => {
    const hysteresisDegrees = 12
    const manager = new OrientationManager(new SimulatedAttitudeProvider(OrientationState.Portrait), {
      hysteresisDegrees,
    })
    advance(manager, 0.5)
    expect(manager.current).toBe(OrientationState.Portrait)

    // 45 + 12 = 57 度までは Portrait のまま。
    expect(angleDistanceToState(56, OrientationState.Portrait)).toBeLessThan(45 + hysteresisDegrees)
    expect(angleDistanceToState(58, OrientationState.Portrait)).toBeGreaterThan(45 + hysteresisDegrees)
  })

  it('180度ひっくり返しても姿勢が切り替わる', () => {
    // 真逆の向きへの補間は回転軸が一意に決まらない。
    // ここを線形補間で処理すると from に戻り続けて、永久に切り替わらなくなる。
    const provider = new SimulatedAttitudeProvider(OrientationState.Portrait)
    const manager = new OrientationManager(provider)
    advance(manager, 0.5)
    expect(manager.current).toBe(OrientationState.Portrait)

    provider.setState(OrientationState.PortraitUpsideDown)
    advance(manager, 1.5)

    expect(manager.current).toBe(OrientationState.PortraitUpsideDown)
  })

  it('180度反転の途中で中間の姿勢を確定させない', () => {
    const provider = new SimulatedAttitudeProvider(OrientationState.Portrait)
    const manager = new OrientationManager(provider)
    const changes: OrientationState[] = []
    advance(manager, 0.5)
    manager.onOrientationChanged((current) => changes.push(current))

    provider.setState(OrientationState.PortraitUpsideDown)
    advance(manager, 1.5)

    // 通過点の Landscape が確定してしまうと、ステージ側のギミックが誤爆する。
    expect(changes).toEqual([OrientationState.PortraitUpsideDown])
  })

  it('平置きでは直前の姿勢を保持する', () => {
    const provider = new SimulatedAttitudeProvider(OrientationState.LandscapeRight)
    const manager = new OrientationManager(provider)
    advance(manager, 0.5)
    expect(manager.current).toBe(OrientationState.LandscapeRight)

    // 画面をほぼ真上に向けた状態 (平置き)。
    const flatProvider: { sourceName: string; start: () => Promise<void>; stop: () => void; read: () => { gravity: Vec3; available: boolean } } = {
      sourceName: 'flat',
      start: async () => {},
      stop: () => {},
      read: () => ({ gravity: { x: 0, y: 0, z: -1 }, available: true }),
    }
    manager.setProvider(flatProvider)
    advance(manager, 1)

    expect(manager.flat).toBe(true)
    expect(manager.current).toBe(OrientationState.LandscapeRight)
  })

  it('姿勢データが無い間は Unknown のまま落ちない', () => {
    const manager = new OrientationManager({
      sourceName: 'none',
      start: async () => {},
      stop: () => {},
      read: () => ({ gravity: { x: 0, y: 0, z: 0 }, available: false }),
    })

    advance(manager, 1)
    expect(manager.current).toBe(OrientationState.Unknown)
    expect(manager.attitudeAvailable).toBe(false)
  })
})

describe('センサーの符号', () => {
  it('iOS 系の UserAgent は ios 規約になる', () => {
    const iphone =
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1'
    expect(detectGravitySignConvention(iphone)).toBe('ios')
  })

  it('Android は仕様準拠 (spec) 規約になる', () => {
    const android = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Mobile Safari/537.36'
    expect(detectGravitySignConvention(android)).toBe('spec')
  })

  it('ios 規約では生値がそのまま下向きとして扱われる', () => {
    const provider = new DeviceMotionAttitudeProvider({ signConvention: 'ios' })
    // 立てて持ったときの iOS の値。
    const event = {
      accelerationIncludingGravity: { x: 0, y: -9.8, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
    } as DeviceMotionEvent

    // ハンドラは private なので、イベント経由ではなく型を緩めて直接叩く。
    ;(provider as unknown as { handleMotion: (e: DeviceMotionEvent) => void }).handleMotion(event)

    const attitude = provider.read()
    expect(attitude.available).toBe(true)
    expect(rollToNearestState(gravityToRollDegrees(attitude.gravity))).toBe(OrientationState.Portrait)
  })

  it('spec 規約では生値を反転して下向きにする', () => {
    const provider = new DeviceMotionAttitudeProvider({ signConvention: 'spec' })
    // 立てて持ったときの仕様準拠実装の値 (iOS と逆符号)。
    const event = {
      accelerationIncludingGravity: { x: 0, y: 9.8, z: 0 },
      acceleration: { x: 0, y: 0, z: 0 },
    } as DeviceMotionEvent

    ;(provider as unknown as { handleMotion: (e: DeviceMotionEvent) => void }).handleMotion(event)

    const attitude = provider.read()
    expect(rollToNearestState(gravityToRollDegrees(attitude.gravity))).toBe(OrientationState.Portrait)
  })
})

describe('補助関数', () => {
  it('smoothingFactor は半減期どおりに減衰する', () => {
    // 半減期ちょうどで 50% 進む。
    expect(smoothingFactor(0.5, 0.5)).toBeCloseTo(0.5, 6)
    expect(smoothingFactor(0, 0.1)).toBe(1)
  })

  it('slerpDirection は単位ベクトルを保つ', () => {
    const from = { x: 0, y: -1, z: 0 }
    const to = { x: 1, y: 0, z: 0 }
    for (let t = 0; t <= 1; t += 0.1) {
      const result = slerpDirection(from, to, t)
      expect(Math.hypot(result.x, result.y, result.z)).toBeCloseTo(1, 6)
    }
  })

  it('slerpDirection は真逆の向きでも NaN を出さない', () => {
    const result = slerpDirection({ x: 0, y: -1, z: 0 }, { x: 0, y: 1, z: 0 }, 0.5)
    expect(Number.isNaN(result.x + result.y + result.z)).toBe(false)
    expect(Math.hypot(result.x, result.y, result.z)).toBeCloseTo(1, 6)
  })

  it('deltaAngle は -180 < d <= 180 に正規化する', () => {
    expect(deltaAngle(170, -170)).toBeCloseTo(20, 6)
    expect(deltaAngle(-170, 170)).toBeCloseTo(-20, 6)
    expect(deltaAngle(0, 360)).toBeCloseTo(0, 6)
  })
})

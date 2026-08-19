import * as THREE from 'three'
import type { Vec3 } from '../core/orientation'
import type { StageDefinition } from '../stages/definitions'

const CAMERA_FOV = 45
const FIT_MARGIN = 1.18
const WALL_VISUAL_THICKNESS = 0.28
const GOAL_RING_THICKNESS = 0.09

const COLORS = {
  background: 0x11131a,
  roomFace: 0x181c27,
  edge: 0x39415a,
  wallIdle: 0x2a3145,
  wallDown: 0x3f5570,
  block: 0x4d566f,
  ball: 0x6ee7a8,
  goal: 0xffc861,
  goalCleared: 0x6ee7a8,
} as const

/** 壁の識別。どの向きが「下」かを色で示すために使う。 */
const WALL_DIRECTIONS: ReadonlyArray<{ x: number; y: number }> = [
  { x: 0, y: -1 },
  { x: 1, y: 0 },
  { x: 0, y: 1 },
  { x: -1, y: 0 },
]

/**
 * ゲーム画面の描画。
 *
 * 世界は固定したまま、重力の向きだけが端末の姿勢に追従する。
 * いまどちらが「下」なのかは、その向きの壁を明るくして示す。
 * 矢印やテキストより、壁そのものが光るほうが状況を読み取りやすい。
 */
export class GameScene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly stageGroup = new THREE.Group()

  private ball: THREE.Mesh | null = null
  private goalRing: THREE.Mesh | null = null
  private walls: THREE.Mesh[] = []
  private boundingRadius = 5.3
  private topInsetPixels = 0

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(COLORS.background)
    this.scene.add(this.stageGroup)

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 400)

    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x1a1e2a, 2.4))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.5)
    keyLight.position.set(2, 5, 8)
    this.scene.add(keyLight)

    this.resize()
  }

  /** ステージを組み直す。前のステージの表示物はすべて捨てる。 */
  loadStage(stage: StageDefinition): void {
    this.clearStage()

    const half = stage.halfSize
    // 部屋は正面から見た正方形なので、対角ではなく辺の半分に画角を合わせる。
    // 対角で合わせると 4 割ほど小さく映って、盤面が読み取りにくくなる。
    this.boundingRadius = half + WALL_VISUAL_THICKNESS

    this.stageGroup.add(this.createFloorPlane(half))
    this.stageGroup.add(this.createOutline(half))
    this.walls = this.createWalls(half)
    for (const wall of this.walls) {
      this.stageGroup.add(wall)
    }

    for (const box of stage.blocks) {
      this.stageGroup.add(this.createBlock(box.center, box.half))
    }

    this.goalRing = this.createGoalRing(stage.goal.position, stage.goal.radius)
    this.stageGroup.add(this.goalRing)

    this.ball = this.createBall(stage.ballRadius)
    this.stageGroup.add(this.ball)

    this.resize(this.topInsetPixels)
  }

  update(ballPosition: Vec3, gravityDirection: Vec3, cleared: boolean): void {
    if (this.ball) {
      this.ball.position.set(ballPosition.x, ballPosition.y, 0)
    }

    if (this.goalRing) {
      const material = this.goalRing.material as THREE.MeshBasicMaterial
      material.color.setHex(cleared ? COLORS.goalCleared : COLORS.goal)
    }

    this.highlightDownWall(gravityDirection)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * 画面サイズに合わせてカメラを配置し直す。
   *
   * 縦長の画面では水平の画角が縦より狭いので、狭いほうに合わせて距離を決める。
   * 上部の UI が覆うぶんは、部屋を下へずらして残りの領域の中央に置く。
   */
  resize(topInsetPixels = this.topInsetPixels): void {
    this.topInsetPixels = topInsetPixels

    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setSize(width, height, false)

    const aspect = width / height
    this.camera.aspect = aspect

    const verticalHalfFov = (CAMERA_FOV / 2) * (Math.PI / 180)
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
    const narrowestHalfFov = Math.min(verticalHalfFov, horizontalHalfFov)
    const distance = (this.boundingRadius * FIT_MARGIN) / Math.sin(narrowestHalfFov)

    const visibleHeight = 2 * distance * Math.tan(verticalHalfFov)
    const insetFraction = height > 0 ? Math.min(topInsetPixels / height, 0.55) : 0
    const offsetY = (visibleHeight * insetFraction) / 2

    this.camera.position.set(0, offsetY, distance)
    this.camera.lookAt(0, offsetY, 0)
    this.camera.updateProjectionMatrix()
  }

  /** 重力の向きに最も近い壁だけを明るくする。 */
  private highlightDownWall(gravityDirection: Vec3): void {
    let bestIndex = 0
    let bestAlignment = -Infinity

    for (let i = 0; i < WALL_DIRECTIONS.length; i++) {
      const direction = WALL_DIRECTIONS[i]!
      const alignment = direction.x * gravityDirection.x + direction.y * gravityDirection.y
      if (alignment > bestAlignment) {
        bestAlignment = alignment
        bestIndex = i
      }
    }

    for (let i = 0; i < this.walls.length; i++) {
      const material = this.walls[i]!.material as THREE.MeshStandardMaterial
      material.color.setHex(i === bestIndex ? COLORS.wallDown : COLORS.wallIdle)
    }
  }

  private clearStage(): void {
    for (const child of [...this.stageGroup.children]) {
      this.stageGroup.remove(child)
      disposeObject(child)
    }
    this.walls = []
    this.ball = null
    this.goalRing = null
  }

  private createFloorPlane(half: number): THREE.Mesh {
    // ボールとブロックの背面。奥行きの手がかりになる。
    return new THREE.Mesh(
      new THREE.PlaneGeometry(half * 2, half * 2),
      new THREE.MeshStandardMaterial({ color: COLORS.roomFace, roughness: 1, metalness: 0 }),
    ).translateZ(-0.6)
  }

  private createOutline(half: number): THREE.LineSegments {
    return new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.PlaneGeometry(half * 2, half * 2)),
      new THREE.LineBasicMaterial({ color: COLORS.edge }),
    )
  }

  private createWalls(half: number): THREE.Mesh[] {
    const outer = half + WALL_VISUAL_THICKNESS / 2

    return WALL_DIRECTIONS.map((direction) => {
      const horizontal = direction.y !== 0
      const geometry = horizontal
        ? new THREE.BoxGeometry(half * 2 + WALL_VISUAL_THICKNESS * 2, WALL_VISUAL_THICKNESS, 1.2)
        : new THREE.BoxGeometry(WALL_VISUAL_THICKNESS, half * 2 + WALL_VISUAL_THICKNESS * 2, 1.2)

      const mesh = new THREE.Mesh(
        geometry,
        new THREE.MeshStandardMaterial({ color: COLORS.wallIdle, roughness: 0.8, metalness: 0 }),
      )
      mesh.position.set(direction.x * outer, direction.y * outer, 0)
      return mesh
    })
  }

  private createBlock(center: Vec3, half: Vec3): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(half.x * 2, half.y * 2, 1.2),
      new THREE.MeshStandardMaterial({ color: COLORS.block, roughness: 0.75, metalness: 0 }),
    )
    mesh.position.set(center.x, center.y, 0)
    return mesh
  }

  private createGoalRing(position: Vec3, radius: number): THREE.Mesh {
    const mesh = new THREE.Mesh(
      new THREE.RingGeometry(radius - GOAL_RING_THICKNESS, radius, 48),
      new THREE.MeshBasicMaterial({ color: COLORS.goal, side: THREE.DoubleSide }),
    )
    mesh.position.set(position.x, position.y, -0.3)
    return mesh
  }

  private createBall(radius: number): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(radius, 32, 16),
      new THREE.MeshStandardMaterial({ color: COLORS.ball, roughness: 0.3, metalness: 0.1 }),
    )
  }
}

/** GPU 上のリソースは参照を外すだけでは解放されない。 */
function disposeObject(object: THREE.Object3D): void {
  const mesh = object as Partial<THREE.Mesh>
  mesh.geometry?.dispose()

  const material = mesh.material
  if (Array.isArray(material)) {
    for (const entry of material) {
      entry.dispose()
    }
  } else {
    material?.dispose()
  }
}

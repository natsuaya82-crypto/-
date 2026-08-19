import * as THREE from 'three'
import type { Vec3 } from '../core/orientation'

const ROOM_SIZE = 4
const BALL_RADIUS = 0.36
const ARROW_LENGTH = 1.4
const CAMERA_FOV = 45

/** 部屋を内包する球の半径。立方体の対角線の半分。 */
const ROOM_BOUNDING_RADIUS = (ROOM_SIZE / 2) * Math.SQRT2 * 1.05

/** 画面端に接しないための余白係数。 */
const FIT_MARGIN = 1.12

/**
 * Phase 0 の確認用シーン。
 *
 * 世界は固定したまま、重力方向だけが端末の姿勢に追従する。
 * 「端末を回すとゲーム世界のルール(重力)が変わる」ことを、
 * ボールがどの壁に着くかで目に見える形にするのが目的。
 *
 * 物理は使わず、重力方向から接地位置を直接求めている。
 * 実際に落とすのは Phase 1 以降。
 */
export class Phase0Scene {
  private readonly renderer: THREE.WebGLRenderer
  private readonly scene: THREE.Scene
  private readonly camera: THREE.PerspectiveCamera
  private readonly ball: THREE.Mesh
  private readonly gravityArrow: THREE.ArrowHelper

  constructor(canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))

    this.scene = new THREE.Scene()
    this.scene.background = new THREE.Color(0x11131a)

    this.camera = new THREE.PerspectiveCamera(CAMERA_FOV, 1, 0.1, 200)

    this.scene.add(new THREE.HemisphereLight(0xbcd4ff, 0x202430, 2.2))
    const keyLight = new THREE.DirectionalLight(0xffffff, 1.6)
    keyLight.position.set(3, 4, 6)
    this.scene.add(keyLight)

    this.scene.add(this.createRoom())

    this.ball = this.createBall()
    this.scene.add(this.ball)

    this.gravityArrow = new THREE.ArrowHelper(
      new THREE.Vector3(0, -1, 0),
      new THREE.Vector3(0, 0, 0),
      ARROW_LENGTH,
      0xff5a6e,
      ARROW_LENGTH * 0.32,
      ARROW_LENGTH * 0.2,
    )
    this.scene.add(this.gravityArrow)

    this.resize()
  }

  /** 重力方向 (単位ベクトル) を反映する。 */
  update(gravityDirection: Vec3): void {
    const direction = new THREE.Vector3(gravityDirection.x, gravityDirection.y, gravityDirection.z)
    if (direction.lengthSq() < 1e-6) {
      return
    }
    direction.normalize()

    this.gravityArrow.setDirection(direction)

    // 重力方向の壁にボールを接地させる。壁の内側に半径ぶん余裕を持たせる。
    const contactDistance = ROOM_SIZE / 2 - BALL_RADIUS
    this.ball.position.copy(direction).multiplyScalar(contactDistance)
  }

  render(): void {
    this.renderer.render(this.scene, this.camera)
  }

  /**
   * 画面サイズに合わせてカメラを配置し直す。
   *
   * 縦長の画面では水平方向の画角が縦より狭くなるため、距離を固定にすると部屋が
   * 横にはみ出す。狭い方の画角に合わせて距離を決める。
   *
   * また HUD が上部を覆うので、その高さぶん部屋を下にずらして残りの領域の中央に置く。
   */
  resize(hudHeightPixels = 0): void {
    const width = window.innerWidth
    const height = window.innerHeight
    this.renderer.setSize(width, height, false)

    const aspect = width / height
    this.camera.aspect = aspect

    const verticalHalfFov = (CAMERA_FOV / 2) * (Math.PI / 180)
    const horizontalHalfFov = Math.atan(Math.tan(verticalHalfFov) * aspect)
    const narrowestHalfFov = Math.min(verticalHalfFov, horizontalHalfFov)

    const distance = (ROOM_BOUNDING_RADIUS * FIT_MARGIN) / Math.sin(narrowestHalfFov)

    // HUD に隠れない領域の中心へ持っていくための上方向オフセット。
    // カメラを上げると、原点にある部屋は画面上では下に移動する。
    const visibleHeight = 2 * distance * Math.tan(verticalHalfFov)
    const hudFraction = height > 0 ? Math.min(hudHeightPixels / height, 0.6) : 0
    const offsetY = (visibleHeight * hudFraction) / 2

    this.camera.position.set(0, offsetY, distance)
    this.camera.lookAt(0, offsetY, 0)
    this.camera.updateProjectionMatrix()
  }

  private createRoom(): THREE.Object3D {
    const room = new THREE.Group()

    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(new THREE.BoxGeometry(ROOM_SIZE, ROOM_SIZE, ROOM_SIZE)),
      new THREE.LineBasicMaterial({ color: 0x4a5570 }),
    )
    room.add(edges)

    // 面がうっすら見えることで、ボールがどの壁に着いているか分かりやすくなる。
    const faces = new THREE.Mesh(
      new THREE.BoxGeometry(ROOM_SIZE, ROOM_SIZE, ROOM_SIZE),
      new THREE.MeshStandardMaterial({
        color: 0x1b1f2c,
        side: THREE.BackSide,
        roughness: 0.95,
        metalness: 0,
      }),
    )
    room.add(faces)

    return room
  }

  private createBall(): THREE.Mesh {
    return new THREE.Mesh(
      new THREE.SphereGeometry(BALL_RADIUS, 32, 16),
      new THREE.MeshStandardMaterial({ color: 0x6ee7a8, roughness: 0.35, metalness: 0.1 }),
    )
  }
}

/**
 * OS による画面の自動回転を打ち消すための情報。
 *
 * このゲームは「世界は端末に固定され、重力だけが動く」ことで成立している。
 * ところが OS が画面を回すと、描画している世界も一緒に回ってしまい、
 * 部屋から見た重力の向きが常に「下」のままになる。端末を回しても何も起きなくなる。
 *
 * ネイティブアプリ側は Info.plist で縦固定にしてある。
 * ただし iOS の Safari では回転をロックできないため、
 * OS が回した角度ぶん世界を回し返して、端末との位置関係を保つ。
 */

/** 画面が自然な向きから何度回っているか。取得できない環境では 0。 */
export function getScreenRotationDegrees(): number {
  if (typeof screen === 'undefined') {
    return 0
  }

  const angle = screen.orientation?.angle
  return typeof angle === 'number' && Number.isFinite(angle) ? angle : 0
}

/**
 * 画面の向きが変わったときに通知する。
 * 解除用の関数を返す。
 */
export function observeScreenRotation(listener: (degrees: number) => void): () => void {
  const notify = (): void => listener(getScreenRotationDegrees())

  screen.orientation?.addEventListener('change', notify)
  window.addEventListener('orientationchange', notify)

  return () => {
    screen.orientation?.removeEventListener('change', notify)
    window.removeEventListener('orientationchange', notify)
  }
}

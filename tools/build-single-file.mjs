/**
 * dist/ のビルド結果を 1 枚の HTML にまとめる。
 *
 * 外部ファイルを読み込めない場所 (Artifact など) に貼って動かすため。
 * 出力は <title> / <style> / 本文 / <script> の並びで、
 * <html> や <body> のタグは含めない。埋め込み側が包むため。
 *
 * 実行: npm run build && node tools/build-single-file.mjs
 */
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { join } from 'node:path'

const DIST = 'dist'
const OUT_DIR = 'artifacts/demo'
const OUT_FILE = join(OUT_DIR, 'gravity-room.html')

/** dist/assets から指定拡張子のファイルを 1 つ取る。 */
async function readAsset(extension) {
  const files = await readdir(join(DIST, 'assets'))
  const match = files.find((name) => name.endsWith(extension))
  if (!match) {
    throw new Error(`dist/assets に ${extension} が見つかりません`)
  }
  return readFile(join(DIST, 'assets', match), 'utf8')
}

/** インライン化した JS の中に </script> があると、そこで script 要素が閉じてしまう。 */
const escapeForScriptTag = (code) => code.replaceAll('</script', '<\\/script')

async function main() {
  const html = await readFile(join(DIST, 'index.html'), 'utf8')
  const css = await readAsset('.css')
  const js = await readAsset('.js')

  // dist/index.html の <body> の中身だけを取り出す。
  const bodyMatch = html.match(/<body[^>]*>([\s\S]*?)<\/body>/)
  if (!bodyMatch?.[1]) {
    throw new Error('dist/index.html から body を取り出せませんでした')
  }

  // ビルド結果が参照している外部ファイルへのタグは、インライン化したので取り除く。
  const body = bodyMatch[1].replace(/<script[^>]*src="[^"]*"[^>]*><\/script>/g, '').trim()

  const titleMatch = html.match(/<title>([\s\S]*?)<\/title>/)
  const title = titleMatch?.[1]?.trim() ?? 'Gravity Room'

  const output = `<title>${title}</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
<style>
${css}
</style>
${body}
<script type="module">
${escapeForScriptTag(js)}
</script>
`

  await mkdir(OUT_DIR, { recursive: true })
  await writeFile(OUT_FILE, output)

  const sizeKb = Math.round(Buffer.byteLength(output) / 1024)
  console.log(`${OUT_FILE} (${sizeKb} KB)`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})

# Gravity Room

端末そのものを回して、玉をゴールへ運ぶ 3D パズル。

**「スマホを傾けるゲーム」ではない。** 端末の姿勢は、ゲーム世界のルール（重力の向き）を
切り替えるための入力として扱う。傾き量ではなく、どちらが「下」になったかだけを見る。

技術構成: **Three.js + TypeScript + Vite**、iOS 配信は **Capacitor**（JJJJ / LLLLLLL と同じ）。

---

## 遊び方

端末を 90 度ずつ回すと、世界の「下」が変わり、玉がその向きの壁へ落ちる。
障害物を避けながらゴールの輪へ運ぶ。

センサーが使えない環境（PC など）では、画面下の回転ボタンか **← →** キーで代用できる。

---

## 開発

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` は LAN に公開されるので、**表示された Network の URL を iPhone の Safari で開けば
そのまま実機で確認できる**。ビルドも TestFlight も要らない。

```bash
npm test           # ロジックのテスト (vitest)
npm run typecheck  # 型チェック
npm run verify     # ブラウザを実際に動かして遊べるか確認する
npm run demo       # 単一 HTML を artifacts/demo/ に出す
```

### `npm run verify` が見ているもの

ヘッドレスブラウザでページを開き、iOS が送ってくる形の `DeviceMotionEvent` を合成して流し込む。

- 姿勢判定が 4 方向とも正しいか（180 度反転・平置きを含む）
- 3 ステージが実際にクリアできるか。**素直な手では解けないことも確認する**
- 日本語と英語で文言が出るか
- センサーが無い環境で、回転ボタンとキーボードで遊べるか

スクリーンショットは `artifacts/shots/` に出る。

### URL のオプション

| クエリ | 効果 |
|---|---|
| `?lang=ja` / `?lang=en` | 言語を固定する |
| `?debug=1` | 姿勢の生データを出す HUD を表示する |

---

## 構成

```
src/
  core/
    orientation.ts         重力ベクトル <-> 角度 <-> 姿勢 の変換（純粋関数）
    attitude.ts            姿勢の取得元の抽象化。センサー実装とシミュレーション実装
    orientationManager.ts  平滑化・ヒステリシス・安定待ちを含む姿勢判定
  physics/
    world.ts               球と直方体の物理。固定間隔で解く自作の最小実装
  stages/
    definitions.ts         ★ステージの定義。ここに足すだけでコースが増える
    stageManager.ts        読み込み・クリア判定・進行
  systems/
    gravityManager.ts      姿勢 -> 世界の重力方向
  scene/
    gameScene.ts           Three.js の描画
  ui/
    gameUi.ts              ステージ番号・回転数・クリア表示・回転ボタン
    hud.ts                 ?debug=1 のときだけ出る開発用の情報表示
  i18n/                    日本語 / 英語
  main.ts                  起動と毎フレームの更新
```

### コースの増やし方

`src/stages/definitions.ts` の `STAGES` に 1 つ足すだけ。仕組み側は触らない。

```ts
{
  id: 'my-new-stage',
  halfSize: 5,
  ballRadius: 0.4,
  ballStart: { x: -4.6, y: -4.6, z: 0 },
  goal: { position: { x: 3.95, y: -3.95, z: 0 }, radius: 0.85 },
  blocks: [block(0, -2.5, 0.6, 2.5)],
  parRotations: 3,
}
```

足したら `src/stages/stages.test.ts` に「想定手順で解ける」テストも書くこと。
**解けないステージを公開してしまう事故は、これでしか防げない。**

### 物理について

物理エンジンは使わず、球と軸平行な直方体だけの最小実装を自作している。

- 固定間隔（1/120 秒）で解くので、フレームレートが違っても**同じ軌跡になる**。
  パズルの解答が端末によって変わらないために必要。
- 速度に上限があり、壁をすり抜けない。
- 単体テストで挙動を固定できる。

### 姿勢判定の考え方

1. `DeviceMotionEvent` から**端末ローカル座標系の重力ベクトル**を取る
   （`accelerationIncludingGravity` から `acceleration` を引いて純粋な重力成分を残す）
2. 指数平滑でノイズを落とす（半減期 0.06 秒、フレームレート非依存）
3. 画面平面成分から**ロール角**を求める（Portrait = 0 度、反時計回りが正）
4. 45 度ごとの 4 セクターに分類。**ヒステリシス 12 度**で境界のバタつきを防ぐ
5. 新しい姿勢が **0.15 秒**続いて初めて確定させる
6. 平置きのときは判定を保留し、直前の状態を維持する

**`screen.orientation` は判定に一切使っていない。** iPhone の画面回転ロックを ON にしても動く。

### センサーの符号について

`accelerationIncludingGravity` は iOS と仕様準拠の実装（Android）で符号が逆になる。

- iOS: 立てて持つと `(0, -9.8, 0)` → 生値がそのまま「下向き」
- 仕様準拠: 立てて持つと `(0, +9.8, 0)` → 反転が必要

UserAgent から自動判定している。上下が逆に出る場合は `?debug=1` の HUD 下部のボタンで切り替えられる。

---

## 公開

### Web (GitHub Pages)

**初回だけ手作業が要る。** リポジトリの Settings > Pages を開き、
Source を **GitHub Actions** に変更する。

ワークフローのトークンでは Pages を新規に有効化できないため
(`Resource not accessible by integration` で落ちる)、ここだけは
リポジトリの管理権限を持つ人がやる必要がある。

一度設定すれば、あとは push で自動公開される（`.github/workflows/pages.yml`）。
作業ブランチからも公開できるようにしてあるのは、main へ取り込む前に実物を確認するため。

公開先: <https://natsuaya82-crypto.github.io/-/>

### iPhone (TestFlight)

Mac 不要。タグを打つだけ（`.github/workflows/ios-deploy.yml`）。

```bash
git tag build-1
git push origin build-1
```

ビルド番号はタグ名の数字がそのまま `CFBundleVersion` になる。
2 回目以降は必ず番号を上げること（同じ番号だとアップロードだけが 409 で落ちる）。

必要な Secrets は JJJJ / LLLLLLL と同じ Apple Team のものを流用できる。
新規に要るのは `PROVISIONING_PROFILE_BASE64` だけ（Bundle ID: `com.tokinets.gimmick`、
プロファイル名: `Gimmick Distribution`）。

---

## 現時点の制約

- ステージは 3 つだけ。仕組みは揃ったので、あとは増やすだけの状態。
- 音は無い。
- 進行状況を保存していない。リロードすると最初から。
- iOS ではモーションセンサーの利用に「タップして開始」が必要（iOS 13 以降の仕様）。
- `ios/` の Xcode プロジェクトは Linux 上で生成した。Xcode で開いての確認はしていない。

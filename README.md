# スマホギミックゲーム

スマートフォンそのものを操作して、ゲーム世界のルールを変えながら攻略する
**3D 短編ステージ型アクションパズル**。

「スマホを傾けるゲーム」ではない。端末の姿勢は、ゲーム世界のルール（重力・世界回転）を
切り替えるための入力として扱う。

技術構成: **Three.js + TypeScript + Vite**、iOS 配信は **Capacitor**（JJJJ / LLLLLLL と同じ）。

---

## いまの状態: Phase 0 完了

端末の物理姿勢を検出し、`OrientationState` として画面に表示するところまで。

| 端末の持ち方 | 表示 |
|---|---|
| そのまま立てて持つ | `Portrait` |
| 反時計回りに 90 度（画面上端が左） | `Landscape Left` |
| さらに 90 度（上下逆） | `Portrait Upside Down` |
| さらに 90 度（画面上端が右） | `Landscape Right` |
| 机に平置き | 直前の状態を保持、`Flat: true` |

3D の部屋の中のボールが、重力方向の壁に移動する。
「端末を回すと世界のルールが変わる」ことが目に見える形になっている。

---

## 開発

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run dev` は LAN に公開されるので、**表示された Network の URL を iPhone の Safari で開けば
そのまま実機で確認できる**。ビルドも TestFlight も要らない。

```bash
npm test           # 姿勢判定ロジックのテスト
npm run typecheck  # 型チェック
npm run build      # dist/ を生成
```

### 実機相当の自動確認

```bash
node tools/verify-phase0.mjs
```

ヘッドレスブラウザでページを開き、iOS が送ってくる形の `DeviceMotionEvent` を合成して
流し込み、4 姿勢が正しく判定されるかを確認する。
スクリーンショットは `artifacts/phase0/` に出る。

---

## 構成

```
src/
  core/
    orientation.ts         重力ベクトル <-> 角度 <-> 姿勢 の変換（純粋関数）
    attitude.ts            姿勢の取得元の抽象化。センサー実装とシミュレーション実装
    orientationManager.ts  姿勢の判定と公開 ★Phase 0 の中核
    orientation.test.ts    上記のテスト
  systems/
    gravityManager.ts      姿勢 -> 世界の重力方向
  scene/
    phase0Scene.ts         Three.js の描画
  ui/
    hud.ts                 検証用の情報表示
  main.ts                  起動と毎フレームの更新
tools/
  verify-phase0.mjs        ブラウザを実際に動かす確認スクリプト
ios/                       Capacitor が生成した Xcode プロジェクト
public/
  coming-soon.html         以前のプレースホルダーページ
```

### 姿勢判定の考え方

1. `DeviceMotionEvent` から **端末ローカル座標系の重力ベクトル** を取る
   （`accelerationIncludingGravity` から `acceleration` を引いて、純粋な重力成分を残す）
2. 指数平滑でノイズを落とす（半減期 0.06 秒、フレームレート非依存）
3. 画面平面成分から **ロール角** を求める（Portrait = 0 度、反時計回りが正）
4. 45 度ごとの 4 セクターに分類。**ヒステリシス 12 度**で境界のバタつきを防ぐ
5. 新しい姿勢が **0.15 秒**続いて初めて確定させる
6. 平置き（画面平面成分が 0.35 未満）のときは判定を保留し、直前の状態を維持する

数値はすべて `OrientationManager` のコンストラクタ引数で調整できる。

### OS の画面回転を使っていないこと

- `screen.orientation` は **判定に一切使っていない**（HUD に参考表示しているだけ）
- 姿勢はモーションセンサー由来の重力ベクトルからのみ求める
- iPhone の画面回転ロックを ON にしても動作する

### センサーの符号について

`accelerationIncludingGravity` は iOS と仕様準拠の実装（Android）で符号が逆になる。

- iOS: 立てて持つと `(0, -9.8, 0)` → 生値がそのまま「下向き」
- 仕様準拠: 立てて持つと `(0, +9.8, 0)` → 反転が必要

UserAgent から自動判定しているが、**もし上下が逆に出たら HUD 下部のボタンで切り替えられる**。

---

## iPhone 実機配信（TestFlight）

Mac 不要。`.github/workflows/ios-deploy.yml` が GitHub Actions 上で完結させる。

```bash
git tag build-1
git push origin build-1
```

ビルド番号はタグ名の数字がそのまま `CFBundleVersion` になる。
2 回目以降は必ず番号を上げること（同じ番号だとアップロードだけが 409 で落ちる）。

### 必要な Secrets

JJJJ / LLLLLLL と**同じ Apple Developer Team** を使うので、証明書と API キーは流用できる。

| Secret | 備考 |
|---|---|
| `APPLE_TEAM_ID` | 既存からコピー可 |
| `DISTRIBUTION_P12_BASE64` | 既存からコピー可 |
| `DISTRIBUTION_P12_PASSWORD` | 既存からコピー可 |
| `APP_STORE_CONNECT_ISSUER_ID` | 既存からコピー可 |
| `IOS_KEY_ID` | 既存からコピー可 |
| `IOS_API_KEY` | 既存からコピー可 |
| `PROVISIONING_PROFILE_BASE64` | **このアプリ用に新規作成が必要** |

### 新規に必要な Apple 側の登録

1. Apple Developer → Identifiers で App ID を作る（Bundle ID: `com.tokinets.gimmick`）
2. Profiles で App Store 用の Provisioning Profile を作る（名前: `Gimmick Distribution`）
3. App Store Connect でアプリを新規登録する（同じ Bundle ID）
4. `.mobileprovision` を base64 にして `PROVISIONING_PROFILE_BASE64` へ

Bundle ID とプロファイル名を変える場合は、以下の 2 箇所も同じ文字列に直すこと。
**ここがずれると archive か export で必ず落ちる。**

- `.github/workflows/ios-deploy.yml` の `env:`
- `ios/App/App.xcodeproj/project.pbxproj` の `PROVISIONING_PROFILE_SPECIFIER`
- `capacitor.config.ts` の `appId`

---

## 現時点の制約

- 物理エンジンは未導入。Phase 0 のボールは重力方向から接地位置を直接求めているだけ。
- iOS ではモーションセンサーの利用に「タップして開始」が必要（iOS 13 以降の仕様）。
- HUD は検証用。本番 UI は後の Phase で作る。
- `ios/` の Xcode プロジェクトは Linux 上で `npx cap add ios` して生成し、
  Release 構成だけ手動署名に書き換えてある。Xcode で開いての確認はしていない。

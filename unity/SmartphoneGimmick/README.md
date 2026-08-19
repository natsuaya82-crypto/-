# スマホギミックゲーム — Phase 0

端末そのものの物理姿勢を取得し、`OrientationState` として画面に表示するところまで。

**このゲームは「スマホを傾けるゲーム」ではない。**
端末の姿勢は、ゲーム世界のルール（重力・世界回転）を切り替えるための入力として扱う。
Phase 0 はその入力層だけを作る。

---

## 1. プロジェクトを開く

1. Unity Hub → `Add` → `Add project from disk`
2. このフォルダ（`unity/SmartphoneGimmick`）を選ぶ
3. Unity 6 (6000.x LTS) で開く

> `ProjectSettings/ProjectVersion.txt` には `6000.0.0f1` と書いてある。
> インストール済みの Unity 6 で開けば問題ない（アップグレードの確認が出たら OK を押す）。
> Unity 2022.3 LTS を使いたい場合は、このファイルの中身を `m_EditorVersion: 2022.3.x` に書き換えてから開く。

初回起動時に「Phase 0 セットアップ」のダイアログが出る。**「実行する」**を押せば 2 と 3 は完了する。

## 2. Project Settings を適用する

メニュー **Tools > Phase 0 > 1. Apply Recommended Project Settings**

適用される内容（詳細は `Assets/Editor/Phase0ProjectSetup.cs`）:

| 設定 | 値 | 理由 |
|---|---|---|
| Default Orientation | **Portrait** | OS の自動回転で画面が回ると、ゲーム側の世界回転と二重にかかる |
| Auto Rotation 各方向 | すべて OFF | 同上 |
| Status Bar Hidden | ON | 全画面 |
| iOS Target OS | 13.0 | |
| iOS Requires Full Screen | ON | |
| iOS Automatic Signing | ON | 個人の Apple ID でビルドできるようにする |
| iOS Scripting Backend | IL2CPP | iOS 必須 |
| Bundle Identifier | `com.example.smartphonegimmick` | 未設定時のみ。実機ビルド時は自分のものに変える |

## 3. シーンを生成する

メニュー **Tools > Phase 0 > 2. Create or Rebuild Phase 0 Scene**

`Assets/Scenes/Phase0.unity` が生成され、Build Settings に登録される。
シーンの中身は Main Camera と `GameSystems`（3コンポーネント）だけ。

**シーンが壊れたら、このメニューをもう一度実行すれば元に戻る。**

## 4. Editor で動作確認する

Play を押す。センサーが無いので `Simulated` モードになり、画面に 4 つのボタンが出る。
押すと `ORIENTATION STATE` の表示が切り替わる。

判定ロジックだけを確かめたい場合は **Tools > Phase 0 > 4. Run Orientation Self Test**（結果は Console）。

## 5. iPhone 実機で確認する（GitHub Actions → TestFlight）

**Mac は不要。** ビルドも署名も TestFlight への配信も GitHub Actions 上で完結する。
ワークフローは `.github/workflows/ios-testflight.yml`（リポジトリのルート）。

```
ubuntu (1倍課金)  Unity で Xcode プロジェクトを生成      ← 重い処理はこちら
      ↓ artifact
macOS (10倍課金)  署名 → archive → TestFlight へ配信     ← 短く保つ
```

### 5-1. 初回だけ必要な準備

#### (a) Unity ライセンスを CI に登録する

1. Actions タブ → **Unity Activation File (初回のみ)** → `Run workflow`
2. 完了後、Artifacts から `unity-activation-file` をダウンロード（`.alf`）
3. <https://license.unity3d.com/manual> を開き、`.alf` をアップロード（Unity Personal を選択）
4. 発行された `.ulf` をテキストエディタで開き、**中身を全部**コピー
5. Settings > Secrets and variables > Actions で `UNITY_LICENSE` として登録

> Unity Plus / Pro を契約している場合は `.alf` は不要で、
> `UNITY_EMAIL` / `UNITY_PASSWORD` / `UNITY_SERIAL` の3つを Secret に入れるだけでよい。

#### (b) Apple 側の登録

JJJJ / LLLLLLL と**同じ Apple Developer Team**（`9B2R9YPV5B`）を使うので、
証明書と API キーはそのまま流用できる。新しく作るのは App ID とプロファイルだけ。

1. Apple Developer → Identifiers で **新しい App ID** を作る
   - Bundle ID: `com.tokinets.gimmick`
2. Profiles で **App Store 用の Provisioning Profile** を作る
   - 名前: `Gimmick Distribution`
   - 証明書は既存の Apple Distribution を選ぶ
3. App Store Connect で**アプリを新規登録**する（同じ Bundle ID）
4. ダウンロードした `.mobileprovision` を base64 にして Secret へ

> Bundle ID とプロファイル名を変えたい場合は、
> `.github/workflows/ios-testflight.yml` 冒頭の `env:` も同じ文字列に直すこと。
> **ここがずれると archive か export のどちらかで必ず落ちる。**

#### (c) Secrets 一覧

| Secret | 中身 | 備考 |
|---|---|---|
| `UNITY_LICENSE` | `.ulf` の中身 | (a) で取得 |
| `APPLE_TEAM_ID` | `9B2R9YPV5B` | JJJJ / LLLLLLL と同じ |
| `DISTRIBUTION_P12_BASE64` | 配布証明書 | **既存からコピー可** |
| `DISTRIBUTION_P12_PASSWORD` | 同上のパスワード | **既存からコピー可** |
| `PROVISIONING_PROFILE_BASE64` | 新しいプロファイル | (b) で新規作成 |
| `APP_STORE_CONNECT_ISSUER_ID` | App Store Connect API | **既存からコピー可** |
| `IOS_KEY_ID` | 同上 | **既存からコピー可** |
| `IOS_API_KEY` | 同上（`.p8` の中身） | **既存からコピー可** |

### 5-2. ビルドを流す

JJJJ / LLLLLLL と同じ。タグを打つだけ。

```bash
git tag build-1
git push origin build-1
```

ビルド番号はタグ名の数字部分がそのまま `CFBundleVersion` になる。
2回目以降は必ず番号を上げること（同じ番号だとアップロードだけが 409 で落ちる）。

Actions タブからの手動実行もできる（その場合は run 番号が使われる）。

完了後、TestFlight アプリに配信される。

### 確認手順（Phase 0 の合格条件）

**先に iPhone の画面回転ロックを ON にする**（コントロールセンターの鍵アイコン）。
ロックしても姿勢判定が動くことが、「OS の自動回転をゲームロジックにしていない」ことの証明になる。

| 端末の持ち方 | 期待される表示 |
|---|---|
| そのまま立てて持つ | `Portrait` |
| 反時計回りに 90 度回す（画面上端が左） | `Landscape Left` |
| さらに 90 度回す（上下逆） | `Portrait Upside Down` |
| さらに 90 度回す（画面上端が右） | `Landscape Right` |
| 机に平置きする | 直前の状態を保持、`Flat: True` |

---

## 実装の構成

```
Assets/Scripts/
  Core/
    OrientationState.cs        姿勢の enum と取得元モードの enum
    DeviceAttitude.cs          1フレーム分の姿勢データ (重力ベクトル)
    IDeviceAttitudeProvider.cs 取得元の抽象化インターフェース
    OrientationMath.cs         重力ベクトル <-> 角度 <-> 姿勢 の変換 (純粋計算)
    OrientationManager.cs      姿勢の判定と公開 ★Phase 0 の中核
    SceneComponentLocator.cs   参照未設定時の補完ヘルパ
  Devices/                     ← プラットフォーム依存はここに隔離
    LegacyInputAttitudeProvider.cs   旧 Input Manager (iOS/Android 共通)
    InputSystemAttitudeProvider.cs   Input System パッケージ
    SimulatedAttitudeProvider.cs     センサー無し環境用
    DeviceAttitudeProviderFactory.cs 環境に応じた選択
  Systems/
    GravityManager.cs          姿勢 -> 世界の重力方向 (Phase 0 では値の提供のみ)
  Diagnostics/
    OrientationDebugHud.cs     検証用の画面表示 (IMGUI)
Assets/Editor/
    Phase0ProjectSetup.cs      Project Settings の適用
    Phase0SceneBuilder.cs      シーンの生成
    Phase0SelfTest.cs          変換ロジックのセルフテスト
    Phase0FirstRunPrompt.cs    初回起動時のセットアップ案内
    CiBuilder.cs               CI (batch mode) からの iOS ビルド入口
    IosPostProcessBuild.cs     生成された Xcode プロジェクトへの署名設定の書き込み
```

### 姿勢判定の考え方

1. センサーから**端末ローカル座標系の重力ベクトル**を取る（`Input.gyro.gravity` / `GravitySensor`）
2. 指数平滑でノイズを落とす（半減期 0.06 秒）
3. 画面平面成分から**ロール角**を求める（Portrait = 0 度、反時計回りが正）
4. 45 度ごとの 4 セクターに分類。ただし**ヒステリシス 12 度**を持たせ、境界でバタつかせない
5. 新しい姿勢が **0.15 秒**続いて初めて確定させる
6. 平置き（画面平面成分が 0.35 未満）のときは判定を保留し、直前の状態を維持する

数値はすべて Inspector（`GameSystems` の `Orientation Manager`）から調整できる。

### OS の画面回転を使っていないこと

- `Screen.orientation` は**判定に一切使っていない**（HUD に参考表示しているだけ）
- `Input.compensateSensors` / `InputSettings.compensateForScreenOrientation` は **false に固定**
  （true だと Unity が画面向きに合わせてセンサー値を回してしまう）
- アプリ自体は Portrait 固定でビルドする

---

## 既知の制約

- **`Assets/Scenes/Phase0.unity` はリポジトリに含まれていない。** メニューから生成する。
- `.meta` ファイルは含まれていない。Unity が初回インポート時に生成する。生成後にコミットすること。
- 上下が逆に判定される場合は、`Orientation Manager` の **Invert Gravity** を ON にする（端末・API によるセンサー符号差の保険）。そのときは HUD の `Raw gravity` の値を控えておくこと。
- `GravityManager` の `Apply To Unity Physics` は既定 OFF。Phase 0 では物理を動かす対象がシーンに無いため。
- UI パッケージ（uGUI / TextMeshPro）に依存していない。本番 UI を作る Phase で追加する。

### CI 側の未検証点

ワークフローは JJJJ / LLLLLLL の実績ある手順をベースにしているが、**Unity 部分は一度も実行していない**。
初回は落ちる前提で、以下を見ている。

- **GameCI の Linux + iOS イメージ**（`ubuntu-6000.0.81f1-ios-3.2.2`）でのビルド。
  ここで落ちるようなら `build-xcode-project` の `runs-on` を `macos-latest` に変えれば動くが、
  課金が 10 倍になりビルド時間も伸びる。
- **`Library` キャッシュが無い初回**は Unity のインポートに時間がかかる（30〜60分を見込む）。2回目以降は短縮される。
- **artifact 経由で実行権限が落ちる問題**は tar で固めることで回避しているが、
  `MapFileParser.sh` 周辺で落ちた場合はここを疑う。
- Unity の Product Name に空白が入るため IPA 名は決め打ちせず `find` で拾っている。

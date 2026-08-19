/**
 * 画面に出る文字列。
 *
 * ja を基準にして、en は同じキーをすべて持つことを型で強制する。
 * 翻訳漏れがあればコンパイルが通らない。
 *
 * 姿勢名 (Portrait / Landscape Left など) はここに含めない。
 * OS やセンサーの用語としてどの言語でも英語のまま扱うため。
 */
const ja = {
  'start.title': 'Gravity Room',
  'start.description': '端末そのものを傾けて、玉をゴールへ運ぼう。振ると跳ねる。',
  'start.button': 'タップして開始',
  'start.continueSimulated': 'シミュレーションで続ける',

  'ui.stage': 'STAGE',
  'ui.turns': '回転',
  'ui.retry': 'やり直す',
  'ui.cleared': 'CLEAR',
  'ui.next': '次のステージ',
  'ui.allCleared': 'ALL CLEAR',
  'ui.allClearedNote': '今あるステージはここまで。まだ増えます。',
  'ui.replay': '最初から',
  'ui.tiltHint': '画面をドラッグして端末を傾ける / スペースキーで振る',

  'sensor.checking': 'センサーを確認しています…',
  'sensor.unsupported': 'この環境にはモーションセンサーがありません。',
  'sensor.noData': 'センサーから値が届きませんでした。',
  'sensor.denied': 'モーションセンサーの利用が許可されませんでした',
  'sensor.startFailed': 'センサーを開始できませんでした',
  'sensor.fallbackNotice': '画面のドラッグで端末を傾ける代わりになります。',
  'sensor.embeddedHint': 'ブラウザで直接開くとセンサーが使えます。',

  'hud.caption': 'ORIENTATION STATE',
  'hud.roll': 'Roll',
  'hud.source': 'Source',
  'hud.available': 'Available',
  'hud.flat': 'Flat',
  'hud.rawGravity': 'Raw gravity',
  'hud.smoothed': 'Smoothed',
  'hud.worldGravity': 'World gravity',
  'hud.osOrientation': 'OS orientation',
  'hud.unused': '未使用',
  'hud.invert': '上下が逆に出るときはここをタップ',
} as const

export type MessageKey = keyof typeof ja

const en: Record<MessageKey, string> = {
  'start.title': 'Gravity Room',
  'start.description': 'Tilt the phone itself to roll the ball into the goal. Shake to hop.',
  'start.button': 'Tap to start',
  'start.continueSimulated': 'Continue with simulation',

  'ui.stage': 'STAGE',
  'ui.turns': 'Turns',
  'ui.retry': 'Retry',
  'ui.cleared': 'CLEAR',
  'ui.next': 'Next stage',
  'ui.allCleared': 'ALL CLEAR',
  'ui.allClearedNote': "That's every stage for now. More are coming.",
  'ui.replay': 'Play again',
  'ui.tiltHint': 'Drag to tilt the device / press Space to shake',

  'sensor.checking': 'Checking the sensor…',
  'sensor.unsupported': 'No motion sensor is available here.',
  'sensor.noData': 'The sensor did not report any values.',
  'sensor.denied': 'Permission to use the motion sensor was denied',
  'sensor.startFailed': 'Could not start the sensor',
  'sensor.fallbackNotice': 'Drag on the screen instead of tilting the device.',
  'sensor.embeddedHint': 'Open this page directly in a browser to use the sensor.',

  'hud.caption': 'ORIENTATION STATE',
  'hud.roll': 'Roll',
  'hud.source': 'Source',
  'hud.available': 'Available',
  'hud.flat': 'Flat',
  'hud.rawGravity': 'Raw gravity',
  'hud.smoothed': 'Smoothed',
  'hud.worldGravity': 'World gravity',
  'hud.osOrientation': 'OS orientation',
  'hud.unused': 'unused',
  'hud.invert': 'Tap here if up and down are reversed',
}

export const SUPPORTED_LOCALES = ['en', 'ja'] as const
export type Locale = (typeof SUPPORTED_LOCALES)[number]

/** 海外向けが主なので、判定できない場合は英語に倒す。 */
export const DEFAULT_LOCALE: Locale = 'en'

export const MESSAGES: Record<Locale, Record<MessageKey, string>> = { en, ja }

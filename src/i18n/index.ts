import { DEFAULT_LOCALE, MESSAGES, SUPPORTED_LOCALES, type Locale, type MessageKey } from './messages'

export type { Locale, MessageKey }
export { SUPPORTED_LOCALES, DEFAULT_LOCALE }

/** URL で言語を上書きするためのクエリ名。動作確認と、リンク共有時の指定に使う。 */
const LOCALE_QUERY_KEY = 'lang'

function normalize(tag: string | null | undefined): Locale | null {
  if (!tag) {
    return null
  }

  // "ja-JP" や "en-US" のような地域付きのタグから言語部分だけを見る。
  const language = tag.toLowerCase().split('-')[0]
  return SUPPORTED_LOCALES.find((locale) => locale === language) ?? null
}

/**
 * 使用する言語を決める。優先順位は URL のクエリ → ブラウザの設定 → 既定。
 *
 * navigator.languages を順に見るのは、第一言語が未対応でも
 * 第二言語で対応できる場合があるため。
 */
export function detectLocale(
  search: string = typeof location === 'undefined' ? '' : location.search,
  languages: readonly string[] = typeof navigator === 'undefined' ? [] : navigator.languages,
): Locale {
  const fromQuery = normalize(new URLSearchParams(search).get(LOCALE_QUERY_KEY))
  if (fromQuery) {
    return fromQuery
  }

  for (const tag of languages) {
    const matched = normalize(tag)
    if (matched) {
      return matched
    }
  }

  return DEFAULT_LOCALE
}

export function translate(locale: Locale, key: MessageKey): string {
  return MESSAGES[locale][key]
}

/** 現在の言語に束縛した翻訳関数を作る。 */
export function createTranslator(locale: Locale): (key: MessageKey) => string {
  return (key) => translate(locale, key)
}

/**
 * data-i18n 属性の付いた要素に翻訳を流し込む。
 *
 * HTML 側に日本語も英語も書かずに済むので、文言の追加漏れが
 * 「片方の言語だけ原文のまま」ではなく「キーが無い」という形で表面化する。
 */
export function applyStaticTranslations(root: ParentNode, locale: Locale): void {
  for (const element of root.querySelectorAll<HTMLElement>('[data-i18n]')) {
    const key = element.dataset.i18n as MessageKey | undefined
    if (key && key in MESSAGES[locale]) {
      element.textContent = translate(locale, key)
    }
  }
}

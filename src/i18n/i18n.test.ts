import { describe, expect, it } from 'vitest'
import { detectLocale } from './index'
import { DEFAULT_LOCALE, MESSAGES, SUPPORTED_LOCALES, type Locale } from './messages'

describe('翻訳の網羅', () => {
  const keysOf = (locale: Locale): string[] => Object.keys(MESSAGES[locale]).sort()

  it('すべての言語が同じキーを持つ', () => {
    const reference = keysOf(DEFAULT_LOCALE)
    for (const locale of SUPPORTED_LOCALES) {
      expect(keysOf(locale)).toEqual(reference)
    }
  })

  it('空文字の翻訳が無い', () => {
    for (const locale of SUPPORTED_LOCALES) {
      for (const [key, value] of Object.entries(MESSAGES[locale])) {
        expect(value.trim(), `${locale}.${key}`).not.toBe('')
      }
    }
  })

  it('英語の文言に日本語が混ざっていない', () => {
    // ひらがな・カタカナ・漢字。翻訳し忘れて日本語のままコピーした場合に気づける。
    const japanesePattern = /[぀-ヿ一-龯]/
    for (const [key, value] of Object.entries(MESSAGES.en)) {
      expect(japanesePattern.test(value), `en.${key}: ${value}`).toBe(false)
    }
  })
})

describe('言語の判定', () => {
  it('URL のクエリが最優先', () => {
    expect(detectLocale('?lang=ja', ['en-US'])).toBe('ja')
    expect(detectLocale('?lang=en', ['ja-JP'])).toBe('en')
  })

  it('地域付きのタグでも言語部分で判定する', () => {
    expect(detectLocale('', ['ja-JP'])).toBe('ja')
    expect(detectLocale('', ['en-GB'])).toBe('en')
  })

  it('未対応の言語は次の候補を見る', () => {
    expect(detectLocale('', ['fr-FR', 'ja-JP'])).toBe('ja')
  })

  it('候補がすべて未対応なら既定の言語になる', () => {
    expect(detectLocale('', ['fr-FR', 'de-DE'])).toBe(DEFAULT_LOCALE)
    expect(detectLocale('', [])).toBe(DEFAULT_LOCALE)
  })

  it('未対応の言語をクエリで指定してもブラウザ設定へ落ちる', () => {
    expect(detectLocale('?lang=fr', ['ja-JP'])).toBe('ja')
  })
})

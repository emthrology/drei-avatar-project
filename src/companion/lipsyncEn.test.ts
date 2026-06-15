import { describe, expect, it } from 'vitest'
import { wordToVisemes } from './lipsyncEn'

const v = (word: string) => wordToVisemes(word).map((f) => f.viseme)

describe('wordToVisemes — 영어 글자→viseme', () => {
  it('기본 자모음', () => {
    expect(v('papa')).toEqual(['PP', 'aa', 'PP', 'aa'])
  })

  it('digraph (sh→CH)', () => {
    expect(v('ship')).toEqual(['CH', 'I', 'PP'])
  })

  it('trigraph (tch→CH)', () => {
    expect(v('match')).toEqual(['PP', 'aa', 'CH'])
  })

  it('어말 묵음 e 스킵', () => {
    expect(v('the')).toEqual(['TH'])
    expect(v('phone')).toEqual(['FF', 'O', 'nn'])
  })

  it('연속 동일 viseme 합치기 (ll)', () => {
    expect(v('hello')).toEqual(['E', 'DD', 'O'])
  })

  it('aspirated h는 입 모양 없음', () => {
    expect(v('h')).toEqual(['sil'])
  })

  it('fraction은 0..1 등분', () => {
    const frames = wordToVisemes('papa')
    expect(frames.map((f) => f.fraction)).toEqual([0, 0.25, 0.5, 0.75])
  })
})

describe('wordToVisemes — 비Latin(한국어) fallback', () => {
  it('2음절 이하 → aa 하나', () => {
    expect(wordToVisemes('안녕')).toEqual([{ viseme: 'aa', fraction: 0 }])
  })

  it('3음절 이상 → aa/I 교대', () => {
    expect(wordToVisemes('안녕하세요')).toEqual([
      { viseme: 'aa', fraction: 0 },
      { viseme: 'I', fraction: 0.5 },
    ])
  })
})

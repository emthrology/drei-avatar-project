// English word → Oculus viseme sequence (letter-based rules)
// Google TTS는 phoneme 타이밍을 주지 않으므로 단어 내 글자 비율로 분배

export type OculusViseme =
  | 'aa' | 'E' | 'I' | 'O' | 'U'
  | 'PP' | 'FF' | 'SS' | 'CH' | 'DD' | 'kk' | 'nn' | 'RR' | 'TH' | 'sil'

export interface PhonemeFrame {
  viseme: OculusViseme
  fraction: number // 0–1, word 내 시작 위치
}

export function wordToVisemes(word: string): PhonemeFrame[] {
  const latin = word.toLowerCase().replace(/[^a-z]/g, '')

  // 한국어/CJK 등 비Latin 단어: 단순 모음 alternation
  if (!latin) {
    const syllables = [...word].filter((c) => c.trim()).length
    return syllables <= 2
      ? [{ viseme: 'aa', fraction: 0 }]
      : [{ viseme: 'aa', fraction: 0 }, { viseme: 'I', fraction: 0.5 }]
  }

  const seq: OculusViseme[] = []
  let i = 0

  while (i < latin.length) {
    const c0 = latin[i]
    const c1 = latin[i + 1] ?? ''
    const c2 = latin[i + 2] ?? ''

    // Trigraph
    if (c0 + c1 + c2 === 'tch') { seq.push('CH'); i += 3; continue }
    if (c0 + c1 + c2 === 'igh') { seq.push('aa'); i += 3; continue }

    // Digraph
    const di = c0 + c1
    if (di === 'th') { seq.push('TH'); i += 2; continue }
    if (di === 'sh' || di === 'zh') { seq.push('CH'); i += 2; continue }
    if (di === 'ch') { seq.push('CH'); i += 2; continue }
    if (di === 'ph') { seq.push('FF'); i += 2; continue }
    if (di === 'wh') { seq.push('FF'); i += 2; continue }
    if (di === 'ng') { seq.push('kk'); i += 2; continue }
    if (di === 'oo') { seq.push('U'); i += 2; continue }
    if (di === 'ee' || di === 'ea') { seq.push('E'); i += 2; continue }
    if (di === 'ai' || di === 'ay') { seq.push('aa'); i += 2; continue }
    if (di === 'oa') { seq.push('O'); i += 2; continue }
    if (di === 'ou' || di === 'ow') { seq.push('aa'); i += 2; continue }
    if (di === 'oi' || di === 'oy') { seq.push('O'); i += 2; continue }
    if (di === 'au' || di === 'aw') { seq.push('aa'); i += 2; continue }
    if (di === 'ew') { seq.push('U'); i += 2; continue }
    if (di === 'ie') { seq.push('I'); i += 2; continue }

    switch (c0) {
      case 'a': seq.push('aa'); break
      case 'e':
        // 어말 묵음 e: 직전이 자음이고 마지막 글자면 스킵
        if (i === latin.length - 1 && i > 0 && !'aeiou'.includes(latin[i - 1])) break
        seq.push('E')
        break
      case 'i': seq.push('I'); break
      case 'o': seq.push('O'); break
      case 'u': seq.push('U'); break
      case 'y': seq.push('I'); break
      case 'p': case 'b': case 'm': seq.push('PP'); break
      case 'f': case 'v': seq.push('FF'); break
      case 's': case 'z': seq.push('SS'); break
      case 'c': seq.push('ei'.includes(c1) ? 'SS' : 'kk'); break
      case 'g': seq.push('ei'.includes(c1) ? 'CH' : 'kk'); break
      case 'j': seq.push('CH'); break
      case 'k': case 'q': seq.push('kk'); break
      case 'x': seq.push('kk'); break
      case 'd': seq.push('DD'); break
      case 't': seq.push('DD'); break
      case 'l': seq.push('DD'); break
      case 'n': seq.push('nn'); break
      case 'r': seq.push('RR'); break
      case 'w': seq.push('U'); break
      case 'h': break // aspirated: 입 움직임 거의 없음
      default: break
    }
    i++
  }

  if (!seq.length) return [{ viseme: 'sil', fraction: 0 }]

  // 연속 동일 viseme 합치기 (ll, ss 같은 겹자음)
  const collapsed: OculusViseme[] = [seq[0]]
  for (let j = 1; j < seq.length; j++) {
    if (seq[j] !== collapsed[collapsed.length - 1]) collapsed.push(seq[j])
  }

  return collapsed.map((viseme, j) => ({
    viseme,
    fraction: j / collapsed.length,
  }))
}

# TTS 모델 선정 — 실수요 서비스 이식 관점

이 프로젝트(drei-avatar-project 컴패니언)를 **실수요 서비스로 이식**할 때의 TTS 백엔드 선정 가이드.
현재는 Google Cloud TTS **WaveNet** 등급을 사용 중이며([src/companion/locales.ts](../src/companion/locales.ts) `TTS_CONFIG`), 품질이 평탄하다는 문제 제기에서 출발.

관련 코드: [src/companion/tts.ts](../src/companion/tts.ts)(synthesize 호출 + word timing) · [src/companion/locales.ts](../src/companion/locales.ts)(`TTS_CONFIG`).

---

## 1. 한국어 TTS 서비스 전수 비교 (비용 오름차순)

기준: $/1M자 환산. 컴패니언처럼 **짧은 발화(1건 5~20자)를 반복**하는 워크로드 가정.

| #   | 서비스 / 모델                     | 비용 ($/1M자)                              | 무료 티어/월 | 한국어 품질            | 립싱크 타이밍      | 비고                             |
| --- | --------------------------------- | ------------------------------------------ | ------------ | ---------------------- | ------------------ | -------------------------------- |
| 1   | Google **Standard**               | $4                                         | 4M자         | 하                     | ✗                  | 다운그레이드 — 제외              |
| 2   | **Azure Neural**                  | $16                                        | 0.5M자       | 중상                   | ✅ word boundary   | ko-KR 다수(SunHi 등)             |
| 3   | Google **Neural2**                | $16                                        | 1M자         | 중                     | ✗(균등추정)        | 현재 WaveNet과 동일가·드롭인     |
| 4   | **Azure Neural HD**               | $22 (’26.3 인하)                           | 0.5M자       | 상                     | ✅ word boundary   | HD급 중 최저가                   |
| 5   | Google **Chirp3-HD**              | $30                                        | 1M자         | 상                     | ✗                  | 클라우드 HD급                    |
| 6   | Amazon Polly (Seoyeon)            | $16 / Gen $30                              | 있음         | 중                     | ✅ speech marks    | 한국어 음성 1종, 스트리밍 미지원 |
| 7   | **OpenAI gpt-4o-mini-tts**        | ~$40–50 (분당 $0.015)                      | 없음         | 중(외국인 악센트 보고) | ✗                  | 프롬프트로 톤/감정 조절          |
| 8   | **ElevenLabs Flash**              | $50                                        | 1만 자       | 상                     | ✅ char timestamps | 저지연                           |
| 9   | **네이버 CLOVA Voice**            | 월 기본료 ₩90,000(1M자 포함)+초과 ₩4/1천자 | 없음         | **최상급**             | ✗                  | 한국어 발음·억양 국내 최고 평    |
| 10  | **ElevenLabs Multilingual v2/v3** | $100                                       | 1만 자       | **최상급**             | ✅ char timestamps | 감정표현 글로벌 상위             |
| 11  | **Typecast / Supertone**          | 구독제(캐릭터 단위)                        | 체험판       | **최상급**             | 제공(SDK)          | 한국어 캐릭터 연기·감정 특화     |

> 품질만 순수 서열: **Typecast/Supertone ≈ ElevenLabs v3 ≈ CLOVA > Azure Neural HD ≈ Chirp3-HD > Neural2/Azure Neural > WaveNet(현재) > Standard**

---

## 2. 핵심 비용 구조 — 종량제 vs 기본료제

실서비스 비용은 **과금 모델**에서 갈린다.

- **종량제(Google/Azure/Polly/OpenAI/ElevenLabs 크레딧)**: 쓴 만큼. 저트래픽에 유리, 고트래픽에 선형 증가.
- **기본료제(CLOVA)**: 월 ₩90,000(≈$66)에 1M자 포함 + 초과분 **₩4/1천자(≈$3/1M자)**. 저트래픽엔 비싸지만, **고트래픽에서 초과 단가가 압도적으로 저렴** → 규모가 커질수록 유리.
- **약정 할인(Azure commitment)**: 대량 시 ~$7.5/1M자까지 하락.

### 손익분기 개념

CLOVA는 월 **약 3~4M자**를 넘기면 종량제 HD급(Azure Neural HD/Chirp3-HD)보다 저렴해지기 시작하고, 규모가 커질수록 격차 확대.

---

## 3. 이용건수별 추천 (★ 메인)

발화 1건 ≈ 20자 가정(짧은 반응 + 일부 긴 대사 혼합). 실측 후 재보정 권장.

### Tier A — MVP / 프로토타입 (~월 1만 건 이하, ≈0.2M자)

- **추천: Google Chirp3-HD** 또는 **Azure Neural HD**
- 근거: 두 서비스 모두 무료 티어(1M / 0.5M자) 안에 들어와 **실비용 $0**. 공짜 구간에선 품질만 보면 되므로 HD급을 고른다. Azure는 word boundary 제공으로 **립싱크 정확도도 부수 개선**.
- 교체 난이도: Chirp3-HD는 `TTS_CONFIG` 음성명 1줄. Azure는 [tts.ts](../src/companion/tts.ts) fetch 재작성(~50줄).

### Tier B — 소규모 정식 서비스 (~월 10만 건, ≈2M자)

- **추천: Azure Neural HD** (≈$33/월) 또는 **Google Chirp3-HD** (≈$30/월)
- 근거: 무료 티어를 막 초과하는 구간. 종량제 HD급이 가장 합리적. **립싱크 품질까지 감안하면 Azure Neural HD**(word boundary)가 우위.
- 비용 최우선이면 Azure Neural / Google Neural2 (~$16–24/월)로 한 단계 낮춤.

### Tier C — 중규모 (~월 100만 건, ≈20M자)

- **추천: 네이버 CLOVA Voice Premium** (≈$121/월)
- 근거: 이 구간부터 CLOVA 기본료가 상각되어 **HD 종량제(Chirp3-HD $570, Azure Neural HD $429)보다 3~5배 저렴**. 동시에 **한국어 품질은 국내 최상급** → 비용·품질 동시 우위. 한국어 위주 서비스라면 여기서 CLOVA로 전환하는 것이 정석.
- 실시간성이 핵심이면(대화형 스트리밍) CLOVA는 스트리밍 미지원이므로 **Azure Speech 스트리밍 + 약정 할인**을 대안으로.

### Tier D — 대규모 (월 1000만 건+, ≈200M자+)

- **추천: 네이버 CLOVA Voice** (≈$650/월, 실효 $3.2/1M자) — 한국어 위주
- **또는 Azure Neural + commitment 약정**(~$7.5/1M자) — 다국어/스트리밍 병행 시
- 근거: 비용이 지배하는 구간. CLOVA 초과 단가($3/1M)가 최저 수준이며 한국어 품질도 최상. 글로벌·다국어 확장이 필요하면 Azure 약정제로.

### 특수 — 브랜드/캐릭터 아이덴티티가 최우선 (비용 무관)

- **추천: Supertone / Typecast** (한국어 캐릭터 연기·감정, VTuber 정체성과 정확히 일치) 또는 **ElevenLabs v3** + 보이스 클로닝
- 근거: "컴패니언 캐릭터"의 고유 목소리가 서비스 차별점일 때. 종량/구독 비용은 높지만 감정·연기 품질이 클라우드 HD급을 상회.

---

## 4. 한눈에 보기 (트래픽 → 선택)

| 월 이용건수 | 월 문자수(≈) | 1순위                                            | 대안                | 실비용(1순위) |
| ----------- | ------------ | ------------------------------------------------ | ------------------- | ------------- |
| ~1만        | 0.2M         | Chirp3-HD / Azure Neural HD                      | 무료 티어 아무거나  | **$0**        |
| ~10만       | 2M           | **Azure Neural HD**                              | Chirp3-HD / Neural2 | ~$33/월       |
| ~100만      | 20M          | **CLOVA Voice**                                  | Azure(약정)         | ~$121/월      |
| 1000만+     | 200M+        | **CLOVA Voice**                                  | Azure Neural+약정   | ~$650/월      |
| 임의        | —            | (캐릭터 정체성) Supertone/Typecast/ElevenLabs v3 | —                   | 구독/종량     |

---

## 5. 이식 시 코드 영향 (비고)

- **립싱크 개선 동반 가능**: 현재 [tts.ts:51-61](../src/companion/tts.ts#L51-L61)는 word timing을 **균등 분할로 추정**. Azure(word boundary)·ElevenLabs(character timestamps)로 갈아타면 **실제 타이밍**을 받아 립싱크 정확도가 함께 올라간다. Google/CLOVA는 타이밍 미제공 → 균등추정 유지.
- **교체 범위**: Google 계열 등급 변경은 `TTS_CONFIG` 음성명만. Azure/ElevenLabs/CLOVA는 [tts.ts](../src/companion/tts.ts)의 fetch·응답 파싱 재작성 + (선택) word timing 로직 교체.
- **성별 매핑**: 현재 `lang × gender → 음성명` 구조([locales.ts:77-86](../src/companion/locales.ts#L77-L86))는 대부분 서비스에 그대로 적용 가능. 단 Chirp3-HD·ElevenLabs·Supertone은 **명명형(named) 음성**이라 성별별로 개별 voice id를 골라 넣어야 함.
- **개발 원칙 준수**: 교체는 기존 립싱크/무드 파이프라인 비퇴행 전제. word timing 소스가 바뀌면 [visemeApplier.ts](../src/companion/visemeApplier.ts)·[useLipsync.ts](../src/companion/useLipsync.ts) 입력 계약 검증 필요.

---

## 6. 결론 (실수요 이식 기본 전략)

1. **런칭~성장 초기(무료 티어 내)**: **Azure Neural HD** — 공짜 구간에서 HD 품질 + 립싱크 개선까지 확보.
2. **트래픽 본격화(월 100만 건~)**: **네이버 CLOVA Voice**로 전환 — 한국어 품질 최상 + 규모 경제로 최저 비용.
3. **캐릭터 브랜딩이 핵심이면**: **Supertone/Typecast** 또는 ElevenLabs 클로닝을 별도 검토.

> 즉, "무료 구간은 Azure Neural HD, 규모 커지면 CLOVA"가 한국어 실수요 서비스의 기본 경로. 다국어·실시간 스트리밍이 필수면 전 구간 **Azure Speech(+약정)** 단일화가 운영상 단순.

---

### 출처

- [Google Cloud TTS Pricing](https://cloud.google.com/text-to-speech/pricing) · [Chirp 3 HD Docs](https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd)
- [Azure Speech Pricing](https://azure.microsoft.com/ko-kr/pricing/details/speech/) · [Azure TTS 가격 분석(TextToLab)](https://texttolab.com/blog/azure-text-to-speech-pricing) · [Azure Neural HD 업데이트](https://techcommunity.microsoft.com/blog/azure-ai-foundry-blog/azure-speech-%E2%80%93-neural-hd-text-to-speech-recent-voice-updates/4505380)
- [ElevenLabs API Pricing](https://elevenlabs.io/pricing/api) · [OpenAI TTS 가격(TextToLab)](https://texttolab.com/blog/openai-tts-pricing)
- [CLOVA Voice — NAVER Cloud](https://www.ncloud.com/product/aiService/clovaVoice) · [한국어 TTS API 비교(Humelo)](https://humelo.com/tts-api) · [TTS 자연스러움 비교(Typecast)](https://typecast.ai/kr/learn/tts-natural-pronunciation-comparison-2026/)
- [AI Voice Generators 2026(Gradium)](https://gradium.ai/content/best-ai-voice-generators-2026) · [Best TTS APIs(Speechmatics)](https://www.speechmatics.com/company/articles-and-news/best-tts-apis-in-2025-top-12-text-to-speech-services-for-developers)

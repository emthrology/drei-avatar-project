# VRMA(표준 모션 포맷) 도입 검토 — 손동작 작업 착수 전 **먼저 읽을 것**

**결론 먼저**: 앞으로 손동작·제스처를 추가할 때는 **euler 값을 손으로 굴리기 전에 이 경로를 먼저 검토한다.**
손인사 1개를 절차 FK로 만드는 데 실패 5회 + 재개 세션 1회가 들었다. 표준 포맷을 쓰면 그 비용이 사라질 수 있다.

## 왜 지금 이 문서가 있나

절차 FK 저작의 구조적 비용이 실측으로 드러났다:

- **축 매핑이 자세 종속** — 팔 자세를 바꾸면 손목 축을 처음부터 다시 재야 한다
- **euler 커플링** — `armR.y`(롤)를 켜면 `armR.z`(들기)가 무력화된다(손 높이 상관 0.86 → 0.07)
- **굴곡된 팔의 롤은 euler로 표현 불가** → `*.twist` 채널을 따로 만들어야 했다
- **캐릭터마다 값이 다름** — 남자1에서 맞춘 자세가 여자1에선 임계 미달

VRMA는 이 넷을 **포맷 차원에서** 없앤다.

## VRMA 요약

`.vrma` = glTF 기반 VRM 표준 애니메이션. **휴머노이드 본 회전 + 표정 + 시선**을 담는다.

> 같은 VRMA 파일을 **어떤 VRM에도** 쓸 수 있다 — 구현이 대상 모델에 맞게 회전을 자동 변환한다.

즉 "남자1/여자1 각각 튜닝"이 필요 없다.

### 준비된 것들

| | 내용 |
|---|---|
| 라이브러리 | `@pixiv/three-vrm-animation@3.5.3` — 우리 `@pixiv/three-vrm@3.5.3`과 **버전 정확히 일치**, peer `three >=0.137`(우리 0.170). 드롭인 |
| API | `VRMAnimationLoaderPlugin` + `createVRMAnimationClip()` → 표준 `AnimationMixer` |
| 무료 애셋 | VRoid 공식 7종 무료(BOOTH): 전신보이기 / **인사** / 브이 / 슛 / 회전 / 모델포즈 / 스쿼트 |
| 대안 경로 | Mixamo 리타게팅 — 공식 예제 `three-vrm-core/examples/humanoidAnimation/loadMixamoAnimation.js`. 모션 수는 많으나 본 매핑 필요(로컬 공간이 달라 단순 복사 시 비율 깨짐) → VRMA보다 손이 감 |

⚠️ BOOTH 다운로드는 계정 필요 — 파일은 사람이 받아 `public/` 아래 둬야 한다(파이프라인 자동화 불가).

## ⚠️ 드롭인이 **아닌** 지점 — 채널 소유 충돌

이게 이 문서의 진짜 payload다.

VRMA는 `AnimationMixer`가 휴머노이드 본을 **통째로** 구동한다. 우리 `anim/`은
**채널 단일 소유 + hold-last**(CLAUDE.md 불변식) 위에 idle 루프·무드·립싱크·시선을 얹는다.
그냥 붙이면 **서로 본을 뺏는다.**

절충안(미검증 설계안):

| 레이어 | 담당 |
|---|---|
| VRMA 클립 | 이산 제스처(인사·브이·끄덕). 재생 중 해당 본을 절차 레이어가 **양보** |
| 절차 레이어 | 호흡·눈깜빡임·micro-drift·립싱크·시선 (VRMA가 안 건드리는 얼굴/미세동작) |

양보 메커니즘이 핵심 설계 과제다. 기존에 `armPose` 루프가 speaking 때 rest로 양보하는 패턴이 있으니
그걸 확장하는 방향이 유력하다.

## 착수 순서 (권장)

1. **재생만 해본다** (읽기 전용, 1~2h) — 무료 7종 중 `VRMA_02 인사`를 우리 아바타에 얹어 본다.
   판단 기준: **우리 절차 손인사보다 확연히 자연스러운가?** 아니면 도입 안 한다(개발 원칙②).
2. 도입 결정 시 **채널 양보 메커니즘**부터 설계 — 여기가 비퇴행(원칙①) 위험 지점이다.
3. 절차 레이어는 **없애지 않는다.** 립싱크·표정·시선·micro-drift는 VRMA가 못 준다.

## 알아둘 리그 사실

- **VRM T-pose는 손바닥이 아래를 향한다.** 손인사에서 회외(supination)로 손바닥을 정면으로
  돌리는 데 고생한 근본 원인 — rest부터 90° 틀어져 있다
- VRM 0.x는 +X가 오른쪽이었으나 **1.0에서 Z+ 기준**으로 변경됨

## 출처

- [VRM Animation 공식](https://vrm.dev/en/vrma/)
- [VRoid 공지 — .vrma BOOTH 등록 + 무료 7종](https://vroid.com/en/news/6HozzBIV0KkcKf9dc1fZGW)
- [무료 7종 BOOTH](https://vroid.booth.pm/items/5512385)
- [@pixiv/three-vrm-animation npm](https://www.npmjs.com/package/@pixiv/three-vrm-animation) · [API 문서](https://pixiv.github.io/three-vrm/docs/modules/three-vrm-animation.html)
- [vrm-mixamo-retargeter](https://github.com/saori-eth/vrm-mixamo-retargeter)
- [T-Pose Normalization — UniVRM Wiki](https://github.com/vrm-c/UniVRM/wiki/T-Pose-Normalization-for-Model/2b3b9e9c4ad30b5b242811c0bb6741da0ffeddc1)

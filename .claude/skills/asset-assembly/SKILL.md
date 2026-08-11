---
name: asset-assembly
description: 아바타 파츠(상의·하의·헤어·얼굴)나 새 캐릭터를 카탈로그에 추가하는 절차와 에셋 조립 엔진(src/editor/)의 불변식. 새 옷·머리를 넣고 싶을 때, 파츠를 바꿨는데 색상/셰이더 패널에 안 나타난다·썸네일이 없다·파츠가 깨져 보인다는 문제를 다룰 때, extractParts/renderThumbs 파이프라인이나 npm run assets 를 돌릴 때, partLoader 의 rebind/graft 를 손볼 때 사용한다.
---

# 에셋 추가 워크플로 (오프라인 파이프라인)

관련 코드: [scripts/extractParts.mjs](../../../scripts/extractParts.mjs) ·
[scripts/renderThumbs.mjs](../../../scripts/renderThumbs.mjs) ·
[src/editor/constants.ts](../../../src/editor/constants.ts)

1. **소스 VRM 배치.** VRoid Studio 에서 해당 캐릭터 **베이스 위에** 파츠를 입혀 export → `public/avatars/<char>/parts/` 에 둔다 (예: `male1/parts/male_top_xyz.vrm`)
   - ⚠️ `parts/` 는 **gitignore**(미커밋, ~256MB). 다른 환경에선 avatar-composer 에서 복사. 런타임 산출물만 커밋한다
2. **추출 잡 1줄** — `extractParts.mjs` `JOBS` 배열에 추가. 옷=`vrm:false`(→GLB), 스프링헤어·얼굴=`vrm:true`(→VRM, MToon·스프링 보존). 머티리얼 필터(`keepMaterial`)·멀티메시(`meshes:[]`)·본 네임스페이스(`nsBones`)는 기존 항목 참고
3. **카탈로그 1줄** — `constants.ts` 해당 캐릭터의 `catalog[category].variants` 에 `{id, label, url, thumb}` 추가. `id` 는 **전역 고유**(썸네일 파일명·선택 키). url 은 2번 `out` 경로와 일치. **`label` 은 `[명칭][숫자]` 형식으로 통일**(여자1 기준): 얼굴/헤어/상의/하의 + 카테고리 내 1부터 순번(서술형 명칭 금지). id·파일명은 영문 식별자로 별개 유지 — 라벨만 이 규칙
4. **`npm run assets`** — extract→thumbs 일괄 (개별: `npm run extract` / `npm run thumbs`). puppeteer 가 `?thumb=` 경로로 단독 렌더해 `thumbs/<id>.png` 생성. **둘 다 byte-deterministic 재생성이 검증돼 있다** — 산출물이 의심스러우면 지우고 다시 돌려도 안전
5. **커밋 대상** — 런타임 산출물(`<char>/*.glb`·`*.vrm`)과 **썸네일 PNG**(puppeteer 재생성 가능하나 소스 취급). `parts/` 원본은 제외

- **파츠/색상 리스트 부위 라벨은 자동**(별도 작업 불필요). 에디터 리스트 표시명은 메시 이름이 아니라 **머티리얼 이름**에서 뽑는다([meshLabels.ts](../../../src/editor/meshLabels.ts)). VRoid 머티리얼 명명 규칙(`N00_…_<Part>_<NN>_<TYPE>`)이 base·얼굴 변형·바디·헤어·의류·양 성별에 공통이라, 규칙을 따르는 새 에셋은 자동으로 한글 부위 라벨이 붙는다(미매칭 시 원본 메시 이름 fallback). **새 부위 종류**(예 양말·장갑)가 생겨 라벨이 안 붙으면 `LABEL_RULES` 에 1줄 추가(구체적 토큰을 앞에)
- **새 캐릭터(베이스) 추가**는 `CHARACTERS[]` 에 `{id, label, baseUrl, catalog}` 1개 — 엔진은 base 불가지라 무수정. variant id 는 캐릭터 프리픽스로 분리(예 `f1-`)
- ⚠️ **Vercel**: `prebuild` 없음. `parts/` 소스가 미커밋이라 빌드 서버에선 추출 불가 → 위 산출물을 **커밋해야** 배포에 반영된다. 파이프라인은 로컬 전용

# 에셋 조립 엔진(src/editor/) 불변식 — 신규 파츠/로더 수정 시 준수

- **base 불가지 로더**: `load*(url, baseVrm)` 시그니처 유지 — 새 기능도 baseVrm/스펙을 파라미터로 받게
- **컨벤션 락(`BASE_SPEC`)**: VRM1.0·54본·`J_Bip_*`·A-pose·신장 1.756m·MToon. 파츠가 어기면 rebind 깨짐. 외주 사양은 composer `ASSET_SPEC.md`
- **rebind/graft**: 외부 SkinnedMesh skinIndex 는 자기 skeleton.bones 인덱스 → 같은 순서로 base 본 치환 + boneInverses 재사용. base 에 없는 보조 본(소매 `J_Sec_*`, 눈 본)은 부모 아래로 graft 후 rebind 매칭. 스프링 헤어는 base springBoneManager 에 addJoint 병합 → `vrm.update(delta)` 한 번에 같이 돈다(이중 호출 금지)
- **MToon 통일**: 옷 GLB 는 prune 으로 PBR 로드 → 런타임 `toMToon` 변환(shade≈base×0.87, toony 0.95)으로 base 툰과 톤 일치. 아웃라인은 의도적 미부착(촘촘한 의류서 뭉침)
- **seam(meshInfos)**: 파츠 add/remove 후 `setMeshInfos(collectMeshInfos(base))` 재수집 — 색 패널·ShaderPanel(`[vals, meshInfos]` 의존)이 새 파츠를 인지한다. ComposerAvatar 가 슬롯 load 성공 직후 호출. **파츠 로더가 숨긴 base 메시**(얼굴 교체 시 base 얼굴)는 `userData[SHADOWED_BY_PART]` 표식으로 `collectMeshInfos` 가 제외 → swap 얼굴과 중복 행·가시성 이중 소유 토글 충돌 차단(로더가 가시성 소유, dispose 시 복원+표식 해제)
- **slot diff + genRef**: 카테고리 슬롯당 1개 active. 빠른 연속 선택은 genRef 토큰으로 늦게 끝난 로드 폐기(레이스 가드). 캐릭터 전환은 `<ComposerAvatar key={characterId}>` remount + dispose 의 `useGLTF.clear(baseUrl)`

⚠️ **임의 업로드 VRM 은 진정한 파츠 교체가 불가능하다**(Face*/Body* 가 merged 메시). 조립은 authored
베이스+파츠 라이브러리 경로에만 성립하고, 컨벤션 락도 그 경로에만 적용된다.

# 에디터 vs 컴패니언 캔버스 해상도 차이 (조사 노트)

컴패니언 탭 아바타가 에디터 탭보다 거칠게 보이는 이유 조사 결과. 결론: **버그 아님 — 작은 고정 오버레이의 구조적 특성**.

## 두 Canvas 비교

| | 에디터 ([AvatarScene](../src/components/AvatarScene.tsx)) | 컴패니언 ([CompanionOverlay](../src/companion/CompanionOverlay.tsx)) |
|---|---|---|
| 캔버스 크기 | `flex-1` (창 채움, ~수백~1000px+) | **고정 300×400px** |
| `dpr` | 미설정 → 기본 `[1,2]` | 미설정 → 기본 `[1,2]` |
| `fov` | 35 | **28** (더 줌인) |
| AA | `antialias:true` | `antialias:true` |
| 배경 | 불투명 `#1a1a2e` | 투명 (`alpha:true`) |
| 그레이딩 | EffectComposer | EffectComposer |

## 원인 (영향 큰 순)

### ① 캔버스 백버퍼 픽셀 수 — 주원인
해상도 = **CSS 크기 × dpr**. dpr은 둘 다 동일(기본 최대 2)인데 CSS 크기가 다름:
- 컴패니언: 300×400 × 2 = **600×800px**에 아바타 전체 렌더
- 에디터: 큰 패널(예 1000×900) × 2 = **2000×1800px**

같은 아바타를 약 3배 적은 픽셀에 그림 → 에지/디테일 거칢. **탭 간 차이의 본질.**

### ② fov 28 + 상반신 클로즈업 — 체감 증폭
컴패니언은 fov 28에 얼굴을 꽉 채워 프레이밍(본 기반 카메라). 좁은 화각으로 얼굴을 확대해, 300px 안의 픽셀 부족이 얼굴에서 더 도드라짐.

### ③ AA 경로가 EffectComposer로 전환 — 부차적
그레이딩 도입으로 렌더가 오프스크린 타깃을 거침 → 캔버스 네이티브 MSAA(`antialias:true`)는 우회되고 postprocessing 자체 `multisampling`(drei 기본 8)이 AA 담당. **둘 다 EffectComposer라 탭 간 차이 주범은 아님.** 단 "그레이딩 켠 뒤 살짝 더 거칠다"면 이 경로 전환 영향일 수 있음.

## 개선 방법 (미적용 — 필요 시)

컴패니언만 **내부 렌더 해상도를 올림**(CSS 300×400 유지, 백버퍼만 크게 = 슈퍼샘플링):

```tsx
// CompanionOverlay Canvas
<Canvas dpr={[1, 2.5]} ... >   // 또는 고정 dpr={2.5}~3
```

dpr 상한을 2→2.5~3으로 올리면 같은 300×400에 더 많은 픽셀 렌더 → 또렷. 비용은 픽셀 수 제곱 증가지만 300×400은 작아 dpr 3(900×1200)도 부담 적음. [docs/drei-opportunities.md](drei-opportunities.md)의 성능 자동조절(PerformanceMonitor+AdaptiveDpr)과 연계 가능.

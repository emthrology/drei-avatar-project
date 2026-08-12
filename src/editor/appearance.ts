import * as THREE from 'three';
import { type ShaderParams, type MeshInfo } from '../store';
import { labelForMaterialName } from './meshLabels';
import { NO_COLOR_SETS, tintFor, type ColorSetSelection } from './colorSets';

// 조립된 씬에 store 외형값(셰이더 + 메시 색 + 색상 세트)을 적용한다 — 에디터·컴패니언 공유.
// 셰이더(outline/toony)와 머티리얼 색(lit/shade)은 머티리얼 프로퍼티라 양쪽에서 안전히 적용된다.
// **가시성(show/hide)은 제외** — 그건 에디터 전용 메시 토글이고, 컴패니언 가시성은 파츠 로더가
// 소유(얼굴 교체 시 base 얼굴 숨김 등). 가시성까지 적용하면 교체 충돌 위험 → 색/셰이더만.
//
// ⚠️ **색을 쓰는 곳은 여기 하나뿐이어야 한다.** 예전엔 눈색이 별도 축(partLoader.setEyeColor)
// 이라 같은 머티리얼에 쓰는 주체가 둘이었고, 나중에 도는 이 함수가 meshInfos 값으로 조용히
// 되돌렸다(눈색을 고른 뒤 셰이더 슬라이더만 움직여도 풀림). 세트를 **이 함수 안의 레이어**로
// 둔 이유가 그것 — 우선순위가 한 줄에 보이고, 나중에 덮는 이펙트가 존재할 수 없다.
export function applyAppearance(
  scene: THREE.Object3D,
  shader: ShaderParams,
  meshInfos: MeshInfo[],
  colorSets: ColorSetSelection = NO_COLOR_SETS,
) {
  scene.traverse((obj) => {
    if (!(obj instanceof THREE.Mesh)) return;
    const info = meshInfos.find((m) => m.name === obj.name);
    const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
    mats.forEach((mat) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const m = mat as any;
      if (!m.isMToonMaterial) return;
      m.outlineWidthFactor = shader.outlineWidth;
      m.shadingToonyFactor = shader.shadingToonyFactor;
      // 색 우선순위: 세트(부위 틴트) > meshInfos(메시별 색). 세트는 **머티리얼 이름**으로
      // 부위를 판별하므로 meshInfos 에 없는 메시(파츠 교체 직후 등)에도 정확히 걸린다.
      const tint = tintFor(labelForMaterialName(m.name), colorSets);
      if (tint) {
        m.color?.setStyle(tint.lit);
        m.shadeColorFactor?.setStyle(tint.shade);
      } else if (info) {
        m.color?.setStyle(info.litColor);
        m.shadeColorFactor?.setStyle(info.shadeColor);
      }
      m.needsUpdate = true;
    });
  });
}

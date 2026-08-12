import { useState } from 'react';
import {
  PartCategory,
  PartCategoryDef,
  PartStatus,
  Selection,
} from '../constants';
import {
  COLOR_SETS,
  swatchOf,
  type ColorSetAxis,
  type ColorSetSelection,
} from '../colorSets';
import { VariantCard } from './VariantCard';

// VRoid식 피커: 상단 카테고리 탭 + 활성 카테고리의 변형 썸네일 그리드.
// 카테고리 슬롯당 1개 선택(swap-on-select). allowNone 이면 '원본/없음' 카드 선두.
// (스크린샷의 좌측 서브카테고리 rail 은 서브카테고리 도입 시 추가 — 지금은 플랫 4 카테고리.)
//
// 색상 세트는 **모양(변형)과 다른 축**이라 그리드 아래 별도 줄로 둔다. 어느 카테고리 탭에
// 어느 축을 붙일지는 아래 표 한 줄 — 헤어 탭=헤어 세트 / 얼굴 탭=눈동자 세트.
const SET_AXIS_BY_CATEGORY: Partial<Record<PartCategory, ColorSetAxis>> = {
  hair: 'hair',
  face: 'eye',
};
const SET_AXIS_LABEL: Record<ColorSetAxis, string> = {
  hair: '헤어 색 (머리·뒷머리·눈썹)',
  eye: '눈동자 색 (홍채·하이라이트)',
};

interface Props {
  catalog: PartCategoryDef[];
  selection: Selection;
  status: Record<string, PartStatus>;
  onSelect: (cat: PartCategory, variantId: string | null) => void;
  colorSets: ColorSetSelection;
  onColorSet: (axis: ColorSetAxis, id: string | null) => void;
}

export function CatalogPicker({
  catalog,
  selection,
  status,
  onSelect,
  colorSets,
  onColorSet,
}: Props) {
  const [active, setActive] = useState<PartCategory>(catalog[0].id);
  // 카탈로그(캐릭터) 교체 시 active 가 새 카탈로그에 없을 수 있다(예: female 은 hair 탭 없음) → 첫 탭으로 클램프.
  const cat = catalog.find((c) => c.id === active) ?? catalog[0];
  const axis = SET_AXIS_BY_CATEGORY[cat.id];

  return (
    <div className="flex flex-col h-full">
      {/* 상단 탭 바 */}
      <div className="flex items-center gap-1 px-2 border-b border-gray-800 bg-gray-900/95 backdrop-blur">
        {catalog.map((c) => (
          <button
            key={c.id}
            onClick={() => setActive(c.id)}
            className={`px-3 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              cat.id === c.id
                ? 'border-sky-400 text-sky-300'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {/* 변형 그리드 */}
      <div className="flex-1 overflow-y-auto p-2">
        <div className="grid grid-cols-2 gap-2">
          {cat.allowNone && (
            <VariantCard
              variant={null}
              label="원본"
              selected={selection[cat.id] == null}
              onClick={() => onSelect(cat.id, null)}
            />
          )}
          {cat.variants.map((v) => (
            <VariantCard
              key={v.id}
              variant={v}
              label={v.label}
              selected={selection[cat.id] === v.id}
              status={status[cat.id]}
              onClick={() => onSelect(cat.id, v.id)}
            />
          ))}
        </div>

        {/* 틴트 축: 색상 세트 (해당 탭에서만) */}
        {axis && (
          <div className="mt-3 border-t border-gray-800 pt-3">
            <span className="text-[11px] text-gray-400">
              {SET_AXIS_LABEL[axis]}
            </span>
            <div className="flex gap-1.5 items-center mt-1.5 flex-wrap">
              <button
                onClick={() => onColorSet(axis, null)}
                className={`text-[11px] px-2 py-1 rounded ${colorSets[axis] === null ? 'bg-sky-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}
              >
                원본
              </button>
              {COLOR_SETS[axis].map((s) => {
                const { lit, shade } = swatchOf(s);
                return (
                  <button
                    key={s.id}
                    onClick={() => onColorSet(axis, s.id)}
                    // 반원 두 쪽으로 lit/shade 배색을 그대로 보여준다 — 세트가 '색 하나'가
                    // 아니라 **밝은 면·그림자 면 한 쌍**이라는 걸 스와치가 말하게.
                    style={{
                      background: `linear-gradient(135deg, ${lit} 0 50%, ${shade} 50% 100%)`,
                    }}
                    className={`w-6 h-6 rounded-full border-2 ${colorSets[axis] === s.id ? 'border-white' : 'border-transparent'}`}
                    title={`${s.label} — lit ${lit} / shade ${shade}`}
                  />
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

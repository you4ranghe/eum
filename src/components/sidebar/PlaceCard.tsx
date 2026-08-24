'use client';

import { useMemo } from 'react';
import type { Place } from '@/lib/domain/types';
import { getOpenStatus } from '@/lib/time/openingHours';
import { OpenBadge } from '@/components/common/OpenBadge';
import { useMapStore } from '@/store/useMapStore';

interface Props {
  place: Place;
  actionLabel: string;
  onAction: () => void;
  actionDisabled?: boolean;
}

const CATEGORY_LABEL: Record<Place['category'], string> = {
  attraction: '관광',
  restaurant: '음식점',
  cafe: '카페',
  accommodation: '숙소',
  transport: '교통',
  shopping: '쇼핑',
  etc: '기타',
};

/** 검색 결과 한 건. 요구사항의 "오픈 여부/클로징 시간" 표기가 여기서 이뤄진다. */
export function PlaceCard({ place, actionLabel, onAction, actionDisabled }: Props) {
  const focusPlace = useMapStore((s) => s.focusPlace);
  const setView = useMapStore((s) => s.setView);
  const status = useMemo(() => getOpenStatus(place), [place]);

  return (
    <div className="px-3 py-3 hover:bg-surface-muted">
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => {
            setView(place.location, 15);
            focusPlace(place.id); // 상세 모달 오픈
          }}
          className="min-w-0 flex-1 text-left"
        >
          <p className="truncate text-sm font-semibold hover:text-brand">{place.name}</p>
          <p className="truncate text-xs text-gray-500">
            {place.roadAddress ?? place.address}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
            <OpenBadge status={status} />
            <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[11px] text-gray-600">
              {CATEGORY_LABEL[place.category]}
            </span>
            {place.rating != null && (
              <span className="text-[11px] text-gray-500">★ {place.rating.toFixed(1)}</span>
            )}
          </div>
        </button>

        <button
          onClick={onAction}
          disabled={actionDisabled}
          className="shrink-0 rounded-lg border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft disabled:border-border disabled:text-gray-300"
        >
          {actionLabel}
        </button>
      </div>
    </div>
  );
}

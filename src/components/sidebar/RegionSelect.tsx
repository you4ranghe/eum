'use client';

import { REGIONS } from '@/lib/geo/regions';
import { useMapStore } from '@/store/useMapStore';

/** 지역 전환. 지역이 바뀌면 스토어가 지도 제공자까지 자동으로 보정한다. */
export function RegionSelect() {
  const regionCode = useMapStore((s) => s.regionCode);
  const setRegion = useMapStore((s) => s.setRegion);

  return (
    <select
      value={regionCode}
      onChange={(e) => setRegion(e.target.value)}
      aria-label="지역 선택"
      className="rounded-md border border-border bg-surface px-2 py-1 text-sm text-gray-700"
    >
      {Object.values(REGIONS).map((r) => (
        <option key={r.code} value={r.code}>
          {r.name}
        </option>
      ))}
    </select>
  );
}

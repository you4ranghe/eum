'use client';

import { useEffect, useState } from 'react';
import type { Place } from '@/lib/domain/types';
import { searchPlaces } from '@/lib/api/places';
import { useMapStore } from '@/store/useMapStore';
import { useTripStore } from '@/store/useTripStore';
import { PlaceCard } from '@/components/sidebar/PlaceCard';
import { MOCK_PLACES } from '@/lib/mock/mockTrip';

/**
 * 장소 검색 패널.
 * 검색은 300ms 디바운스 후 실행 — 타이핑마다 호출하면 외부 API 쿼터를 태운다.
 */
export function SearchPanel() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Place[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const regionCode = useMapStore((s) => s.regionCode);
  const center = useMapStore((s) => s.center);
  const trip = useTripStore((s) => s.trip);
  const selectedDayId = useTripStore((s) => s.selectedDayId);
  const addStop = useTripStore((s) => s.addStop);

  useEffect(() => {
    if (query.trim().length < 2) {
      setResults([]);
      setNotice(null);
      return;
    }
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const found = await searchPlaces({ query, regionCode, near: center });
        setResults(found);
        setNotice(found.length ? null : '검색 결과가 없습니다.');
      } catch {
        // 백엔드 미기동 상태에서도 화면 흐름을 확인할 수 있게 목 데이터로 폴백
        const fallback = MOCK_PLACES.filter((p) => p.name.includes(query.trim()));
        setResults(fallback);
        setNotice('백엔드에 연결할 수 없어 샘플 데이터를 표시합니다.');
      } finally {
        setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query, regionCode, center]);

  const targetDay = trip?.days.find((d) => d.id === selectedDayId);

  return (
    <div className="flex flex-col">
      <div className="sticky top-0 z-10 border-b border-border bg-surface p-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="장소, 주소 검색 (예: 성산일출봉)"
          className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
        {targetDay && (
          <p className="mt-2 text-xs text-gray-500">
            추가 대상: <span className="font-medium text-brand">{targetDay.dayNumber}일차</span>
          </p>
        )}
      </div>

      {loading && <p className="p-4 text-sm text-gray-400">검색 중…</p>}
      {notice && <p className="px-4 pt-3 text-xs text-amber-600">{notice}</p>}

      <ul className="divide-y divide-border">
        {results.map((place) => (
          <li key={place.id}>
            <PlaceCard
              place={place}
              actionLabel="일정에 추가"
              onAction={() => selectedDayId && addStop(selectedDayId, place)}
              actionDisabled={!selectedDayId}
            />
          </li>
        ))}
      </ul>
    </div>
  );
}

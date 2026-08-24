'use client';

import { useEffect, useState } from 'react';
import clsx from 'clsx';
import { SearchPanel } from '@/components/sidebar/SearchPanel';
import { ItineraryPanel } from '@/components/sidebar/ItineraryPanel';
import { RegionSelect } from '@/components/sidebar/RegionSelect';
import { useTripStore } from '@/store/useTripStore';
import { createMockTrip } from '@/lib/mock/mockTrip';

type Tab = 'search' | 'itinerary';

/**
 * 사이드바는 '검색'과 '일정' 두 모드를 오간다.
 *
 * 두 패널을 라우트가 아니라 탭으로 나눈 이유:
 * 지도는 두 모드에서 공통으로 유지돼야 하는 컨텍스트다.
 * 라우팅으로 분리하면 전환마다 지도 컴포넌트 재마운트 위험이 생기고,
 * "검색 → 일정에 담기"라는 핵심 동선이 페이지 이동으로 끊긴다.
 */
export function Sidebar() {
  const [tab, setTab] = useState<Tab>('itinerary');
  const trip = useTripStore((s) => s.trip);
  const setTrip = useTripStore((s) => s.setTrip);

  // 백엔드 연결 전까지 화면을 확인할 수 있도록 목 데이터를 주입한다.
  // 실제로는 getTrip(tripId)로 교체된다.
  useEffect(() => {
    if (!trip) setTrip(createMockTrip());
  }, [trip, setTrip]);

  return (
    <div className="flex h-full flex-col">
      <header className="border-b border-border px-4 py-3">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight">이음</h1>
          <RegionSelect />
        </div>
        {trip && (
          <p className="mt-1 truncate text-xs text-gray-500">
            {trip.title} · {trip.startDate} ~ {trip.endDate}
          </p>
        )}
      </header>

      <nav role="tablist" className="flex border-b border-border">
        {(
          [
            ['itinerary', '일정'],
            ['search', '장소 검색'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={clsx(
              'flex-1 border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
              tab === key
                ? 'border-brand text-brand'
                : 'border-transparent text-gray-500 hover:text-gray-800',
            )}
          >
            {label}
          </button>
        ))}
      </nav>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {tab === 'search' ? <SearchPanel /> : <ItineraryPanel />}
      </div>
    </div>
  );
}

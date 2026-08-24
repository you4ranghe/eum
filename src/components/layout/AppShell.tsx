'use client';

import { useState } from 'react';
import clsx from 'clsx';
import { MapCanvas } from '@/components/map/MapCanvas';
import { MapProviderTabs } from '@/components/map/MapProviderTabs';
import { Sidebar } from '@/components/sidebar/Sidebar';
import { PlaceDetailModal } from '@/components/place/PlaceDetailModal';

/**
 * ─────────────────────────────────────────────────────────────
 * 화면 골격: [사이드바 | 지도] 2분할.
 *
 * 지도를 flex-1로 두고 사이드바를 고정폭으로 잡은 이유:
 * 지도는 "남는 공간을 전부 쓰는" 요소이고, 사이드바는 정보 밀도가 정해진 요소다.
 * 반대로 잡으면 창 크기가 바뀔 때마다 사이드바 텍스트가 리플로우돼 읽기 불편해진다.
 *
 * 모바일에서는 지도를 전체로 깔고 사이드바를 바텀시트로 올린다.
 * (동일 컴포넌트 트리를 유지하고 CSS만 바꿔, 지도 인스턴스가 재생성되지 않게 한다 —
 *  레이아웃 분기마다 지도를 언마운트하면 SDK 재초기화 비용과 깜빡임이 생긴다.)
 * ─────────────────────────────────────────────────────────────
 */
export function AppShell() {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-surface-muted">
      {/* 사이드바 */}
      <aside
        className={clsx(
          'z-20 flex flex-col border-border bg-surface transition-all duration-200',
          'md:relative md:h-full md:border-r',
          sidebarOpen ? 'md:w-[400px]' : 'md:w-0 md:overflow-hidden',
          // 모바일: 하단 시트
          'fixed inset-x-0 bottom-0 h-[55vh] rounded-t-2xl border-t shadow-2xl md:inset-auto md:rounded-none md:shadow-none',
        )}
      >
        <Sidebar />
      </aside>

      {/* 지도 */}
      <main className="relative h-full flex-1">
        <MapCanvas />

        {/* 지도 위 컨트롤: 제공자 전환 탭 */}
        <div className="pointer-events-none absolute left-4 top-4 z-10 flex gap-2">
          <div className="pointer-events-auto">
            <MapProviderTabs />
          </div>
        </div>

        {/* 데스크톱 사이드바 토글 */}
        <button
          type="button"
          onClick={() => setSidebarOpen((v) => !v)}
          className="absolute left-0 top-1/2 z-10 hidden h-16 w-5 -translate-y-1/2 items-center justify-center rounded-r-md border border-l-0 border-border bg-surface text-gray-500 shadow-sm hover:bg-surface-muted md:flex"
          aria-label={sidebarOpen ? '사이드바 접기' : '사이드바 펼치기'}
        >
          {sidebarOpen ? '‹' : '›'}
        </button>
      </main>

      <PlaceDetailModal />
    </div>
  );
}

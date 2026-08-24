'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useMapStore } from '@/store/useMapStore';
import { useTripStore } from '@/store/useTripStore';
import { createMapAdapter } from '@/lib/map/registry';
import type { MapAdapter, MarkerOptions, PolylineOptions } from '@/lib/map/types';
import type { LatLng } from '@/lib/domain/types';

/**
 * ─────────────────────────────────────────────────────────────
 * 지도 렌더링의 유일한 경계점.
 *
 * 흐름:
 *   Zustand 상태(제공자/지역/선택 날짜/일정)
 *     → useEffect
 *       → adapter.renderMarkers() / renderPolylines()
 *
 * 어댑터를 state가 아니라 ref에 담는 이유:
 * 어댑터는 렌더 결과에 영향을 주는 값이 아니라 '부수효과 핸들'이다.
 * state에 넣으면 생성 시점에 리렌더가 한 번 더 돌고,
 * StrictMode의 이중 마운트에서 인스턴스가 중복 생성되기 쉽다.
 *
 * 제공자 전환 시:
 * 새 어댑터를 만들기 전에 반드시 이전 어댑터를 destroy()하고 컨테이너를 비운다.
 * 두 SDK가 같은 DOM에 오버레이를 남기면 유령 마커가 남는다.
 * ─────────────────────────────────────────────────────────────
 */
export function MapCanvas() {
  const containerRef = useRef<HTMLDivElement>(null);
  const adapterRef = useRef<MapAdapter | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const provider = useMapStore((s) => s.provider);
  const center = useMapStore((s) => s.center);
  const zoom = useMapStore((s) => s.zoom);
  const setView = useMapStore((s) => s.setView);
  const focusedStopId = useMapStore((s) => s.focusedStopId);
  const focusStop = useMapStore((s) => s.focusStop);

  const trip = useTripStore((s) => s.trip);
  const selectedDayId = useTripStore((s) => s.selectedDayId);
  const routes = useTripStore((s) => s.routes);

  const day = trip?.days.find((d) => d.id === selectedDayId) ?? null;
  const route = selectedDayId ? routes[selectedDayId] : undefined;

  // ── 1) 어댑터 수명주기: provider가 바뀔 때만 재생성 ──────────────
  useEffect(() => {
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setReady(false);
    setError(null);

    const adapter = createMapAdapter(provider);
    adapter
      .init(container, {
        center,
        zoom,
        // 사용자가 지도를 움직이면 스토어에 반영 → 제공자 전환 시 시점 유지
        onIdle: (_bounds, z) => {
          const c = adapter.getCenter();
          if (c) setView(c, z);
        },
      })
      .then(() => {
        if (cancelled) {
          adapter.destroy();
          return;
        }
        adapterRef.current = adapter;
        setReady(true);
      })
      .catch((e: Error) => !cancelled && setError(e.message));

    return () => {
      cancelled = true;
      adapter.destroy();
      adapterRef.current = null;
      if (container) container.innerHTML = ''; // SDK 잔여 DOM 제거
    };
    // center/zoom은 의도적으로 의존성에서 제외: 지도를 움직일 때마다
    // 재초기화되면 안 된다. 초기값으로만 사용한다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [provider]);

  const handleMarkerClick = useCallback((id: string) => focusStop(id), [focusStop]);

  // ── 2) 마커/동선 동기화: 선택 날짜의 일정을 그린다 ────────────────
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !ready) return;

    const stops = day?.stops ?? [];

    const markers: MarkerOptions[] = stops.map((stop, i) => ({
      id: stop.id,
      position: stop.place.location,
      label: String(i + 1),
      active: stop.id === focusedStopId,
      onClick: handleMarkerClick,
    }));

    // 경로 API 결과가 있으면 실제 도로 경로를, 없으면 직선(점선)으로 폴백.
    // 폴백을 점선으로 구분해 "아직 계산 전"임을 사용자가 인지하게 한다.
    const lines: PolylineOptions[] = route?.legs.length
      ? route.legs.map((leg) => ({
          id: `${leg.fromStopId}>${leg.toStopId}`,
          path: leg.path,
        }))
      : straightFallback(stops.map((s) => s.place.location));

    adapter.renderMarkers(markers);
    adapter.renderPolylines(lines);
  }, [ready, day, route, focusedStopId, handleMarkerClick]);

  // ── 3) 날짜 탭 전환 시 해당 날짜 동선이 한눈에 보이도록 뷰포트 조정 ──
  useEffect(() => {
    const adapter = adapterRef.current;
    if (!adapter || !ready) return;
    const points = day?.stops.map((s) => s.place.location) ?? [];
    if (points.length) adapter.fitBounds(points, 80);
  }, [ready, selectedDayId, day?.stops.length]);

  return (
    <div className="relative h-full w-full">
      <div ref={containerRef} className="map-canvas h-full w-full" />

      {!ready && !error && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted/60 text-sm text-gray-500">
          지도를 불러오는 중…
        </div>
      )}
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-surface-muted p-6">
          <div className="max-w-sm rounded-lg border border-border bg-surface p-4 text-sm">
            <p className="font-semibold text-red-600">지도를 표시할 수 없습니다</p>
            <p className="mt-1 text-gray-600">{error}</p>
            <p className="mt-2 text-xs text-gray-400">
              .env.local의 지도 API 키와 콘솔의 도메인 허용 설정을 확인하세요.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/** 경로 계산 전 임시 직선. 순서 감각을 즉시 주기 위한 UX 장치. */
function straightFallback(points: LatLng[]): PolylineOptions[] {
  return points.slice(0, -1).map((p, i) => ({
    id: `fallback_${i}`,
    path: [p, points[i + 1]],
    dashed: true,
    color: '#94a3b8',
  }));
}

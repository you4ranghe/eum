'use client';

import { useCallback, useMemo, useState } from 'react';
import clsx from 'clsx';
import { DayTabs } from '@/components/sidebar/DayTabs';
import { StopRow } from '@/components/sidebar/StopRow';
import { useTripStore, computeSchedule } from '@/store/useTripStore';
import { useMapStore } from '@/store/useMapStore';
import { calculateRoute, optimizeStopOrder } from '@/lib/api/places';
import { useTripAlarms, requestNotificationPermission } from '@/lib/alarm/useTripAlarms';
import { getRegion } from '@/lib/geo/regions';

/**
 * 일정 패널 — 날짜 탭 + 방문 순서 목록 + 동선 요약.
 *
 * 경로 계산을 자동이 아니라 버튼으로 둔 이유:
 * 지점을 추가할 때마다 자동 계산하면 외부 API 쿼터가 편집 횟수만큼 소모된다.
 * 무료 티어에서는 이게 곧바로 서비스 중단으로 이어진다.
 * → 편집 중에는 직선 점선으로 보여주고, 사용자가 "동선 계산"을 누른 순간에만
 *   실제 API를 호출한다. 비용 발생 시점을 사용자 의도와 일치시킨다.
 */
export function ItineraryPanel() {
  const trip = useTripStore((s) => s.trip);
  const selectedDayId = useTripStore((s) => s.selectedDayId);
  const selectDay = useTripStore((s) => s.selectDay);
  const routes = useTripStore((s) => s.routes);
  const setRoute = useTripStore((s) => s.setRoute);
  const reorderStops = useTripStore((s) => s.reorderStops);
  const regionCode = useMapStore((s) => s.regionCode);

  const [busy, setBusy] = useState<null | 'calc' | 'optimize'>(null);
  const [error, setError] = useState<string | null>(null);
  const [alarmsOn, setAlarmsOn] = useState(false);

  const day = trip?.days.find((d) => d.id === selectedDayId) ?? null;
  const route = selectedDayId ? routes[selectedDayId] : undefined;

  const schedule = useMemo(
    () => (day ? computeSchedule(day.stops, route) : []),
    [day, route],
  );

  useTripAlarms({ day, route, enabled: alarmsOn, leadMinutes: 10 });

  const waypoints = useMemo(
    () => day?.stops.map((s) => ({ stopId: s.id, location: s.place.location })) ?? [],
    [day],
  );

  const handleCalculate = useCallback(async () => {
    if (!day || waypoints.length < 2) return;
    setBusy('calc');
    setError(null);
    try {
      const result = await calculateRoute({
        dayId: day.id,
        waypoints,
        travelMode: getRegion(regionCode).defaultTravelMode,
        departAt: new Date(`${day.date}T09:00:00`).toISOString(),
      });
      setRoute(day.id, result);
    } catch (e) {
      setError(e instanceof Error ? e.message : '동선 계산에 실패했습니다');
    } finally {
      setBusy(null);
    }
  }, [day, waypoints, regionCode, setRoute]);

  const handleOptimize = useCallback(async () => {
    if (!day || waypoints.length < 3) return;
    setBusy('optimize');
    setError(null);
    try {
      const orderedIds = await optimizeStopOrder({
        dayId: day.id,
        waypoints,
        travelMode: getRegion(regionCode).defaultTravelMode,
        fixFirst: true,
      });
      // 반환된 ID 순서대로 로컬 상태를 재배열한다.
      orderedIds.forEach((id, targetIndex) => {
        const current = useTripStore
          .getState()
          .trip?.days.find((d) => d.id === day.id)
          ?.stops.findIndex((s) => s.id === id);
        if (current != null && current >= 0 && current !== targetIndex) {
          reorderStops(day.id, current, targetIndex);
        }
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : '순서 최적화에 실패했습니다');
    } finally {
      setBusy(null);
    }
  }, [day, waypoints, regionCode, reorderStops]);

  const toggleAlarms = useCallback(async () => {
    if (alarmsOn) return setAlarmsOn(false);
    const granted = await requestNotificationPermission();
    if (!granted) {
      setError('브라우저 알림 권한이 거부되어 알람을 켤 수 없습니다');
      return;
    }
    setAlarmsOn(true);
  }, [alarmsOn]);

  if (!trip) {
    return <p className="p-6 text-sm text-gray-400">여행을 불러오는 중…</p>;
  }

  return (
    <div className="flex h-full flex-col">
      <DayTabs trip={trip} selectedDayId={selectedDayId} onSelect={selectDay} />

      {/* 동선 요약 */}
      <div className="flex items-center justify-between gap-2 border-b border-border bg-surface-muted px-3 py-2 text-xs">
        <span className="text-gray-600">
          {route
            ? `총 ${(route.totalDistanceMeters / 1000).toFixed(1)}km · 이동 ${Math.round(route.totalDurationSeconds / 60)}분`
            : `${day?.stops.length ?? 0}곳 · 동선 미계산`}
        </span>
        <div className="flex gap-1">
          <button
            onClick={handleOptimize}
            disabled={busy !== null || (day?.stops.length ?? 0) < 3}
            className="rounded border border-border bg-surface px-2 py-1 font-medium text-gray-700 disabled:opacity-40"
          >
            {busy === 'optimize' ? '최적화 중…' : '순서 최적화'}
          </button>
          <button
            onClick={handleCalculate}
            disabled={busy !== null || (day?.stops.length ?? 0) < 2}
            className="rounded bg-brand px-2 py-1 font-medium text-white disabled:opacity-40"
          >
            {busy === 'calc' ? '계산 중…' : '동선 계산'}
          </button>
        </div>
      </div>

      {error && <p className="bg-red-50 px-3 py-2 text-xs text-red-600">{error}</p>}

      {/* 방문 지점 목록 */}
      <ol className="min-h-0 flex-1 overflow-y-auto">
        {day?.stops.map((stop, i) => (
          <StopRow
            key={stop.id}
            dayId={day.id}
            stop={stop}
            index={i}
            schedule={schedule[i]}
            leg={route?.legs.find((l) => l.fromStopId === stop.id)}
            isLast={i === day.stops.length - 1}
          />
        ))}
        {(!day || day.stops.length === 0) && (
          <li className="px-6 py-10 text-center text-sm text-gray-400">
            아직 등록된 장소가 없습니다.
            <br />
            <span className="text-xs">‘장소 검색’ 탭에서 추가해 보세요.</span>
          </li>
        )}
      </ol>

      {/* 알람 토글 */}
      <div className="border-t border-border px-3 py-2">
        <button
          onClick={toggleAlarms}
          className={clsx(
            'w-full rounded-lg border px-3 py-2 text-sm font-medium transition-colors',
            alarmsOn
              ? 'border-brand bg-brand-soft text-brand'
              : 'border-border text-gray-600 hover:bg-surface-muted',
          )}
        >
          {alarmsOn ? '🔔 이동 알림 켜짐 (출발 10분 전)' : '🔕 이동 알림 켜기'}
        </button>
      </div>
    </div>
  );
}

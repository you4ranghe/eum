'use client';

import { useMemo } from 'react';
import clsx from 'clsx';
import type { RouteLeg, TripStop } from '@/lib/domain/types';
import { getOpenStatus } from '@/lib/time/openingHours';
import { useMapStore } from '@/store/useMapStore';
import { useTripStore } from '@/store/useTripStore';
import { OpenBadge } from '@/components/common/OpenBadge';

interface Props {
  dayId: string;
  stop: TripStop;
  index: number;
  schedule?: { arrival: string; departure: string; isFixed: boolean };
  /** 이 지점에서 다음 지점으로 가는 구간 */
  leg?: RouteLeg;
  isLast: boolean;
}

/**
 * 일정 목록의 한 행.
 *
 * 마커 번호와 동일한 순번을 왼쪽에 크게 두고, 아래로 구간 이동시간을 잇는다.
 * 지도의 마커/선과 사이드바 목록이 같은 시각 언어(번호+선)를 공유해야
 * 사용자가 둘을 따로 해석하지 않는다.
 */
export function StopRow({ dayId, stop, index, schedule, leg, isLast }: Props) {
  const focusedStopId = useMapStore((s) => s.focusedStopId);
  const focusStop = useMapStore((s) => s.focusStop);
  const focusPlace = useMapStore((s) => s.focusPlace);
  const removeStop = useTripStore((s) => s.removeStop);
  const updateStop = useTripStore((s) => s.updateStop);

  // 영업 상태는 1분 단위로 변하지만, 리렌더 때마다 재계산해도 비용이 없다.
  const status = useMemo(() => getOpenStatus(stop.place), [stop.place]);
  const active = focusedStopId === stop.id;

  return (
    <li
      onMouseEnter={() => focusStop(stop.id)}
      onMouseLeave={() => focusStop(null)}
      className={clsx(
        'relative px-3 py-3 transition-colors',
        active ? 'bg-brand-soft/40' : 'hover:bg-surface-muted',
      )}
    >
      <div className="flex gap-3">
        {/* 순번 + 연결선 */}
        <div className="flex flex-col items-center">
          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand text-xs font-semibold text-white">
            {index + 1}
          </span>
          {!isLast && <span className="mt-1 w-px flex-1 bg-border" />}
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              onClick={() => focusPlace(stop.place.id)}
              className="truncate text-left text-sm font-semibold hover:text-brand"
            >
              {stop.place.name}
            </button>
            <button
              onClick={() => removeStop(dayId, stop.id)}
              aria-label={`${stop.place.name} 삭제`}
              className="shrink-0 text-xs text-gray-300 hover:text-red-500"
            >
              ✕
            </button>
          </div>

          <p className="truncate text-xs text-gray-500">
            {stop.place.roadAddress ?? stop.place.address}
          </p>

          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            <OpenBadge status={status} />

            {/* 도착 시각: 직접 입력하면 그 지점이 기준점이 되고 이후가 재계산된다 */}
            <label className="flex items-center gap-1 text-xs text-gray-500">
              <span>도착</span>
              <input
                type="time"
                value={stop.plannedArrival ?? schedule?.arrival ?? ''}
                onChange={(e) =>
                  updateStop(dayId, stop.id, { plannedArrival: e.target.value || undefined })
                }
                className={clsx(
                  'rounded border px-1 py-0.5 text-xs',
                  schedule?.isFixed
                    ? 'border-brand bg-brand-soft font-medium text-brand'
                    : 'border-border text-gray-600',
                )}
              />
            </label>

            <label className="flex items-center gap-1 text-xs text-gray-500">
              <span>체류</span>
              <input
                type="number"
                min={0}
                step={10}
                value={stop.stayMinutes}
                onChange={(e) =>
                  updateStop(dayId, stop.id, { stayMinutes: Number(e.target.value) })
                }
                className="w-14 rounded border border-border px-1 py-0.5 text-xs"
              />
              <span>분</span>
            </label>
          </div>
        </div>
      </div>

      {/* 다음 지점까지의 이동 정보 */}
      {!isLast && (
        <div className="ml-[38px] mt-2 flex items-center gap-2 text-xs text-gray-400">
          <span>↓</span>
          {leg ? (
            <span>
              {Math.round(leg.durationSeconds / 60)}분 ·{' '}
              {(leg.distanceMeters / 1000).toFixed(1)}km
            </span>
          ) : (
            <span className="italic">이동시간 미계산</span>
          )}
        </div>
      )}
    </li>
  );
}

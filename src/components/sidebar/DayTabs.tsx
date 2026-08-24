'use client';

import clsx from 'clsx';
import type { Trip } from '@/lib/domain/types';

interface Props {
  trip: Trip;
  selectedDayId: string | null;
  onSelect: (dayId: string) => void;
}

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * 날짜 탭.
 *
 * 요구사항의 핵심 연동 지점이다: 탭을 누르면 지도에 그 날짜의 동선만 뜬다.
 * 그 연동을 이 컴포넌트가 직접 하지 않고 selectedDayId 스토어 변경만 하는 이유:
 * 지도를 직접 조작하면 "탭 → 지도" 단방향 의존이 생겨,
 * 나중에 지도 마커 클릭으로 탭을 바꾸는 역방향 연동을 넣을 때 순환 참조가 된다.
 * 양쪽 모두 스토어만 보게 하면 어느 방향이든 자유롭게 추가할 수 있다.
 */
export function DayTabs({ trip, selectedDayId, onSelect }: Props) {
  return (
    <div className="flex gap-1.5 overflow-x-auto border-b border-border px-3 py-2">
      {trip.days.map((day) => {
        const active = day.id === selectedDayId;
        const weekday = WEEKDAYS[new Date(`${day.date}T00:00:00`).getDay()];
        return (
          <button
            key={day.id}
            onClick={() => onSelect(day.id)}
            aria-pressed={active}
            className={clsx(
              'shrink-0 rounded-lg border px-3 py-1.5 text-left transition-colors',
              active
                ? 'border-brand bg-brand text-white'
                : 'border-border bg-surface text-gray-600 hover:bg-surface-muted',
            )}
          >
            <span className="block text-sm font-semibold">{day.dayNumber}일차</span>
            <span className={clsx('block text-[11px]', active ? 'text-blue-100' : 'text-gray-400')}>
              {day.date.slice(5)} ({weekday}) · {day.stops.length}곳
            </span>
          </button>
        );
      })}
    </div>
  );
}

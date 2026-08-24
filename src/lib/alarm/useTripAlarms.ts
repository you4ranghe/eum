'use client';

import { useEffect, useRef } from 'react';
import type { TripDay, DayRoute } from '@/lib/domain/types';
import { computeSchedule } from '@/store/useTripStore';
import { toMinutes } from '@/lib/time/openingHours';

export interface AlarmEvent {
  id: string;
  stopId: string;
  kind: 'depart_soon' | 'arrive_soon' | 'closing_soon';
  title: string;
  body: string;
  /** 발화 예정 시각 (epoch ms) */
  fireAt: number;
}

interface Options {
  day: TripDay | null;
  route: DayRoute | undefined;
  /** 출발 몇 분 전에 알릴지 */
  leadMinutes?: number;
  enabled?: boolean;
  onFire?: (event: AlarmEvent) => void;
}

/**
 * ─────────────────────────────────────────────────────────────
 * 일정 기반 알람.
 *
 * setTimeout을 알람마다 거는 대신 1분 tick + "지나간 알람 스윕" 구조를 쓴 이유:
 * 1) 모바일 브라우저는 백그라운드에서 타이머를 스로틀/정지시킨다.
 *    → 복귀 시점에 "놓친 알람"을 감지해야 하는데, 개별 타이머로는 불가능.
 * 2) 일정이 수정될 때마다 수십 개 타이머를 정리/재생성하는 비용이 크다.
 * 3) tick마다 "지금 시각 기준으로 아직 안 쏜 것 중 시간이 된 것"을 계산하면
 *    상태가 한 곳(fired Set)에만 남아 로직이 단순해진다.
 *
 * 프로덕션 확장 지점:
 * 앱이 완전히 닫힌 상태의 알림은 브라우저 타이머로 불가능하다.
 * → Web Push(Service Worker) + 서버 스케줄러가 필요하며,
 *   이 훅이 만드는 AlarmEvent 목록을 그대로 서버에 등록하면 된다.
 *   (그래서 알람 "계산"과 "발화"를 분리해 두었다)
 * ─────────────────────────────────────────────────────────────
 */
export function useTripAlarms({
  day,
  route,
  leadMinutes = 10,
  enabled = true,
  onFire,
}: Options) {
  const firedRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    firedRef.current.clear(); // 날짜가 바뀌면 발화 이력 초기화
  }, [day?.id]);

  useEffect(() => {
    if (!enabled || !day) return;

    const tick = () => {
      const now = Date.now();
      for (const alarm of buildAlarms(day, route, leadMinutes)) {
        if (firedRef.current.has(alarm.id)) continue;
        // fireAt이 지났으면 발화. 백그라운드 복귀 후 밀린 알람도 여기서 잡힌다.
        if (alarm.fireAt > now) continue;
        // 너무 오래 지난 알람(30분 초과)은 소음이므로 조용히 소거
        if (now - alarm.fireAt > 30 * 60_000) {
          firedRef.current.add(alarm.id);
          continue;
        }
        firedRef.current.add(alarm.id);
        notify(alarm);
        onFire?.(alarm);
      }
    };

    tick();
    const timer = setInterval(tick, 30_000);
    // 탭 복귀 즉시 재계산 — 스로틀로 밀린 알람을 바로 회수한다.
    const onVisible = () => document.visibilityState === 'visible' && tick();
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [day, route, leadMinutes, enabled, onFire]);
}

/** 일정 → 알람 목록. 순수 함수라 서버 푸시 등록에도 그대로 재사용 가능. */
export function buildAlarms(
  day: TripDay,
  route: DayRoute | undefined,
  leadMinutes: number,
): AlarmEvent[] {
  const schedule = computeSchedule(day.stops, route);
  const alarms: AlarmEvent[] = [];

  day.stops.forEach((stop, i) => {
    const s = schedule[i];
    const next = day.stops[i + 1];
    if (!s) return;

    if (next) {
      const leg = route?.legs.find((l) => l.fromStopId === stop.id && l.toStopId === next.id);
      const travelMin = leg ? Math.round(leg.durationSeconds / 60) : null;
      alarms.push({
        id: `${day.id}:${stop.id}:depart`,
        stopId: stop.id,
        kind: 'depart_soon',
        title: `${leadMinutes}분 후 이동`,
        body: travelMin
          ? `${next.place.name}까지 약 ${travelMin}분 — ${s.departure} 출발`
          : `다음 목적지: ${next.place.name} — ${s.departure} 출발`,
        fireAt: atClock(day.date, s.departure, -leadMinutes),
      });
    }

    // 마감 임박 경고: 도착 예정 시각에 이미 닫혀 있으면 일정 자체가 잘못된 것
    const closing = closingTimeOn(stop.place, day.date);
    if (closing != null && toMinutes(s.arrival) >= closing - 30) {
      alarms.push({
        id: `${day.id}:${stop.id}:closing`,
        stopId: stop.id,
        kind: 'closing_soon',
        title: '마감 임박 주의',
        body: `${stop.place.name} 도착 예정 ${s.arrival} — 마감 직전입니다`,
        fireAt: atClock(day.date, s.arrival, -60),
      });
    }
  });

  return alarms.sort((a, b) => a.fireAt - b.fireAt);
}

function closingTimeOn(place: { openingPeriods?: { dayOfWeek: number; close: string }[] }, date: string) {
  const dow = new Date(`${date}T00:00:00`).getDay();
  const p = place.openingPeriods?.find((x) => x.dayOfWeek === dow);
  return p ? toMinutes(p.close) : null;
}

function atClock(date: string, hhmm: string, offsetMinutes = 0): number {
  return new Date(`${date}T${hhmm}:00`).getTime() + offsetMinutes * 60_000;
}

/** 브라우저 알림 권한은 사용자 제스처 안에서 요청해야 차단되지 않는다. */
export async function requestNotificationPermission(): Promise<boolean> {
  if (typeof Notification === 'undefined') return false;
  if (Notification.permission === 'granted') return true;
  if (Notification.permission === 'denied') return false;
  return (await Notification.requestPermission()) === 'granted';
}

function notify(alarm: AlarmEvent) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification(alarm.title, { body: alarm.body, tag: alarm.id });
  }
}

import type { OpenStatus, Place } from '@/lib/domain/types';

/**
 * "지금 영업 중인가?" 판정.
 *
 * 클라이언트에서 계산하는 이유:
 * 이 값은 1분마다 바뀌는데 서버에서 내려주면 캐시가 즉시 낡는다.
 * 서버는 영업시간 "규칙"만 내려주고, 현재 상태는 화면에서 파생시키는 편이
 * 캐시 효율과 정확성을 동시에 얻는다.
 *
 * 타임존을 인자로 받는 이유:
 * 사용자가 서울에서 오사카 일정을 짜는 순간 브라우저 로컬 시간은 오답이 된다.
 * 확장을 전제로 처음부터 장소의 타임존을 기준으로 계산한다.
 */
const CLOSING_SOON_MINUTES = 60;

export function getOpenStatus(place: Place, now: Date = new Date()): OpenStatus {
  if (place.alwaysOpen) {
    return { state: 'open', label: '24시간 영업' };
  }
  if (!place.openingPeriods?.length) {
    return { state: 'unknown', label: '영업시간 정보 없음' };
  }

  const { dayOfWeek, minutes } = localParts(now, place.timezone);

  for (const period of place.openingPeriods) {
    const open = toMinutes(period.open);
    const close = toMinutes(period.close);

    // 자정 넘김("22:00"~"26:00" 또는 "22:00"~"02:00") 구간 정규화
    const spansMidnight = close <= open;
    const closeAdjusted = spansMidnight ? close + 1440 : close;

    // 오늘 시작한 구간 / 어제 시작해 오늘 새벽까지 이어지는 구간 둘 다 검사
    const candidates = [
      { day: period.dayOfWeek, cur: minutes },
      { day: (period.dayOfWeek + 1) % 7, cur: minutes + 1440 },
    ];

    for (const { day, cur } of candidates) {
      if (day !== dayOfWeek) continue;
      if (cur < open || cur >= closeAdjusted) continue;

      const untilClose = closeAdjusted - cur;
      return {
        state: untilClose <= CLOSING_SOON_MINUTES ? 'closing_soon' : 'open',
        nextChangeAt: period.close,
        minutesUntilClose: untilClose,
        label:
          untilClose <= CLOSING_SOON_MINUTES
            ? `${untilClose}분 후 마감`
            : `영업 중 · ${period.close} 마감`,
      };
    }
  }

  const next = findNextOpening(place, dayOfWeek, minutes);
  return {
    state: 'closed',
    nextChangeAt: next?.open,
    label: next ? `영업 종료 · ${next.dayLabel} ${next.open} 오픈` : '영업 종료',
  };
}

const DAY_LABELS = ['일', '월', '화', '수', '목', '금', '토'];

function findNextOpening(place: Place, today: number, nowMinutes: number) {
  const periods = place.openingPeriods ?? [];
  for (let offset = 0; offset < 8; offset++) {
    const day = (today + offset) % 7;
    const sameDay = periods
      .filter((p) => p.dayOfWeek === day)
      .filter((p) => offset > 0 || toMinutes(p.open) > nowMinutes)
      .sort((a, b) => toMinutes(a.open) - toMinutes(b.open));
    if (sameDay.length) {
      return {
        open: sameDay[0].open,
        dayLabel: offset === 0 ? '오늘' : offset === 1 ? '내일' : `${DAY_LABELS[day]}요일`,
      };
    }
  }
  return null;
}

/** "HH:mm" → 분. "26:00" 같은 24시 초과 표기도 그대로 처리된다. */
export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

export function fromMinutes(total: number): string {
  const t = ((total % 1440) + 1440) % 1440;
  const h = String(Math.floor(t / 60)).padStart(2, '0');
  const m = String(t % 60).padStart(2, '0');
  return `${h}:${m}`;
}

/** 특정 타임존에서의 요일/분 추출. Intl만 사용해 별도 의존성 없이 처리. */
function localParts(date: Date, timezone: string): { dayOfWeek: number; minutes: number } {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
  const parts = Object.fromEntries(
    fmt.formatToParts(date).map((p) => [p.type, p.value]),
  ) as Record<string, string>;

  const dayMap: Record<string, number> = {
    Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6,
  };
  const hour = Number(parts.hour) % 24; // "24"로 나오는 환경 방어
  return {
    dayOfWeek: dayMap[parts.weekday] ?? date.getDay(),
    minutes: hour * 60 + Number(parts.minute),
  };
}

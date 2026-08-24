/**
 * 날짜 문자열 유틸.
 *
 * ── 왜 별도 파일인가 ──
 * `new Date().toISOString().slice(0, 10)` 은 "오늘 날짜"를 구하는 관용구처럼 쓰이지만
 * **UTC 기준**이라 한국(UTC+9)에서는 09:00 이전에 하루가 밀린다.
 * 여행 앱은 날짜가 곧 일정 탭이라 이 오차가 그대로 화면 버그가 된다.
 * (실제로 08-25 08:23에 1일차가 08-24로 렌더링되는 문제를 겪었다)
 *
 * → 날짜 문자열을 만드는 경로를 이 파일 하나로 모으고,
 *   "로컬 기준"과 "UTC 기준"을 이름으로 구분해 실수를 막는다.
 */

/** 로컬 시간대 기준 "YYYY-MM-DD". 사용자가 보는 달력 날짜와 항상 일치한다. */
export function toLocalDateString(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** 오늘부터 n일 뒤의 로컬 날짜 문자열. */
export function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

/**
 * "YYYY-MM-DD" 구간을 하루 단위로 펼친다.
 *
 * 내부적으로 UTC 정오를 기준으로 계산하는 이유:
 * 자정을 기준으로 잡으면 서머타임이 있는 지역에서 하루가 통째로 사라지거나
 * 중복될 수 있다. 정오는 어떤 DST 전환에도 같은 날에 머문다.
 */
export function eachDateString(start: string, end: string): string[] {
  const result: string[] = [];
  const cursor = new Date(`${start}T12:00:00Z`);
  const last = new Date(`${end}T12:00:00Z`);
  while (cursor <= last) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return result;
}

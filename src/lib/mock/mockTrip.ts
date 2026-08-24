import type { OpeningPeriod, Place, Trip } from '@/lib/domain/types';
import { addDays, toLocalDateString } from '@/lib/time/dates';

/**
 * 개발용 목 데이터.
 *
 * Supabase 연결 전에도 화면 전체 흐름(날짜 탭 → 마커/동선 → 영업 상태 → 알람)을
 * 확인할 수 있어야 한다. 실제 스키마와 동일한 형태를 유지해,
 * 나중에 getTrip()으로 갈아끼울 때 컴포넌트가 전혀 바뀌지 않도록 했다.
 */
const everyday = (open: string, close: string): OpeningPeriod[] =>
  [0, 1, 2, 3, 4, 5, 6].map((dayOfWeek) => ({ dayOfWeek, open, close }));

export const MOCK_PLACES: Place[] = [
  {
    id: 'mock_seongsan',
    name: '성산일출봉',
    address: '제주특별자치도 서귀포시 성산읍 일출로 284-12',
    location: { lat: 33.4581, lng: 126.9425 },
    category: 'attraction',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.6,
    openingPeriods: everyday('07:00', '20:00'),
  },
  {
    id: 'mock_seopjikoji',
    name: '섭지코지',
    address: '제주특별자치도 서귀포시 성산읍 섭지코지로 261',
    location: { lat: 33.4239, lng: 126.9308 },
    category: 'attraction',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.4,
    alwaysOpen: true,
  },
  {
    id: 'mock_udo',
    name: '우도',
    address: '제주특별자치도 제주시 우도면',
    location: { lat: 33.5069, lng: 126.9528 },
    category: 'attraction',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.5,
    openingPeriods: everyday('08:00', '18:00'),
  },
  {
    id: 'mock_hyeopjae',
    name: '협재해수욕장',
    address: '제주특별자치도 제주시 한림읍 협재리',
    location: { lat: 33.3939, lng: 126.2396 },
    category: 'attraction',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.5,
    alwaysOpen: true,
  },
  {
    id: 'mock_ossulloc',
    name: '오설록 티뮤지엄',
    address: '제주특별자치도 서귀포시 안덕면 신화역사로 15',
    location: { lat: 33.3057, lng: 126.2894 },
    category: 'cafe',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.3,
    openingPeriods: everyday('09:00', '18:00'),
  },
  {
    id: 'mock_cheonjiyeon',
    name: '천지연폭포',
    address: '제주특별자치도 서귀포시 천지동',
    location: { lat: 33.2469, lng: 126.5544 },
    category: 'attraction',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    rating: 4.4,
    openingPeriods: everyday('09:00', '22:00'),
  },
];

/** 2박 3일 제주 일정 샘플 — 요구사항의 "날짜 탭 3개" 시나리오를 그대로 재현한다. */
export function createMockTrip(): Trip {
  const base = new Date();
  // toISOString()은 UTC 기준이라 KST 09:00 이전에는 하루가 밀린다. 반드시 로컬 기준으로.
  const d = (offset: number) => toLocalDateString(addDays(base, offset));

  const stop = (place: Place, order: number, arrival?: string, stay = 60) => ({
    id: `mock_stop_${place.id}_${order}`,
    placeId: place.id,
    place,
    order,
    plannedArrival: arrival,
    stayMinutes: stay,
    travelMode: 'driving' as const,
  });

  return {
    id: 'mock_trip',
    title: '제주 2박 3일',
    regionCode: 'jeju',
    timezone: 'Asia/Seoul',
    startDate: d(0),
    endDate: d(2),
    days: [
      {
        id: 'mock_day_1',
        date: d(0),
        dayNumber: 1,
        stops: [
          stop(MOCK_PLACES[0], 0, '09:00', 90),
          stop(MOCK_PLACES[1], 1, undefined, 60),
          stop(MOCK_PLACES[2], 2, undefined, 120),
        ],
      },
      {
        id: 'mock_day_2',
        date: d(1),
        dayNumber: 2,
        stops: [
          stop(MOCK_PLACES[3], 0, '10:00', 90),
          stop(MOCK_PLACES[4], 1, undefined, 60),
        ],
      },
      {
        id: 'mock_day_3',
        date: d(2),
        dayNumber: 3,
        stops: [stop(MOCK_PLACES[5], 0, '10:00', 60)],
      },
    ],
  };
}

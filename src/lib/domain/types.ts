/**
 * 앱 전역 도메인 타입.
 * 지도 제공자(Naver/Google)에 종속되지 않는 순수 모델만 둔다.
 * → 제공자 SDK 타입이 이 파일에 들어오는 순간 교체 비용이 생기므로 금지.
 */

/** WGS84 위경도. 모든 제공자가 공통으로 이해하는 유일한 좌표계. */
export interface LatLng {
  lat: number;
  lng: number;
}

export interface Bounds {
  sw: LatLng;
  ne: LatLng;
}

/** 요일별 영업시간. 0=일요일 ... 6=토요일 (JS Date.getDay()와 동일) */
export interface OpeningPeriod {
  dayOfWeek: number;
  /** "HH:mm", 현지 시간 기준 */
  open: string;
  /** "HH:mm". 새벽 마감은 "26:00" 같은 24시 초과 표기를 허용한다. */
  close: string;
}

export type PlaceCategory =
  | 'attraction'
  | 'restaurant'
  | 'cafe'
  | 'accommodation'
  | 'transport'
  | 'shopping'
  | 'etc';

export interface Place {
  id: string;
  name: string;
  address: string;
  roadAddress?: string;
  location: LatLng;
  category: PlaceCategory;
  phone?: string;
  rating?: number;
  /** 확장 대비: 지역/타임존은 장소에 붙여둔다. 제주 외 지역으로 넓힐 때 그대로 쓰인다. */
  regionCode: string;
  timezone: string;
  openingPeriods?: OpeningPeriod[];
  /** 상시 영업(24시간) 여부 */
  alwaysOpen?: boolean;
  /** 원본 제공자 식별자 — 상세 검색 링크 생성에 사용 */
  externalRefs?: {
    naverPlaceId?: string;
    googlePlaceId?: string;
  };
}

export type OpenState = 'open' | 'closed' | 'closing_soon' | 'unknown';

export interface OpenStatus {
  state: OpenState;
  /** 영업 중이면 마감 시각, 영업 종료면 다음 오픈 시각 ("HH:mm") */
  nextChangeAt?: string;
  /** 마감까지 남은 분. state가 open/closing_soon일 때만 존재 */
  minutesUntilClose?: number;
  label: string;
}

export type TravelMode = 'driving' | 'walking' | 'transit';

/** 일정에 등록된 한 개의 방문 지점 */
export interface TripStop {
  id: string;
  placeId: string;
  place: Place;
  /** 같은 날짜 내 방문 순서 (0부터) */
  order: number;
  /** 도착 예정 시각 "HH:mm". 미지정이면 앞 구간 이동시간으로 자동 추정 */
  plannedArrival?: string;
  /** 체류 시간(분) */
  stayMinutes: number;
  /** 이 지점까지 오는 구간의 이동 수단 */
  travelMode: TravelMode;
  memo?: string;
}

/** 두 지점 사이 한 구간 */
export interface RouteLeg {
  fromStopId: string;
  toStopId: string;
  distanceMeters: number;
  durationSeconds: number;
  travelMode: TravelMode;
  /** 지도에 그릴 실제 경로 폴리라인. 없으면 직선으로 폴백. */
  path: LatLng[];
}

export interface DayRoute {
  dayId: string;
  legs: RouteLeg[];
  totalDistanceMeters: number;
  totalDurationSeconds: number;
}

export interface TripDay {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** 1일차, 2일차 ... */
  dayNumber: number;
  title?: string;
  stops: TripStop[];
}

export interface Trip {
  id: string;
  title: string;
  regionCode: string;
  timezone: string;
  startDate: string;
  endDate: string;
  days: TripDay[];
}

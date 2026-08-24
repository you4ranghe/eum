import type { LatLng } from '@/lib/domain/types';

/**
 * 지역 설정을 데이터로 분리한 이유:
 * "제주 → 전 세계 확장"을 코드 수정이 아니라 데이터 추가로 처리하기 위함.
 * 지도 초기 중심/줌, 타임존, 기본 이동수단 등 지역마다 다른 값을 한 곳에 모은다.
 */
export interface RegionConfig {
  code: string;
  name: string;
  center: LatLng;
  defaultZoom: number;
  timezone: string;
  /** 섬/도심 여부에 따라 기본 이동수단이 달라진다 (제주=렌터카, 도쿄=대중교통) */
  defaultTravelMode: 'driving' | 'walking' | 'transit';
  /** 검색 결과를 이 범위로 우선 편향(bias)시킨다 */
  searchBias?: { sw: LatLng; ne: LatLng };
}

export const REGIONS: Record<string, RegionConfig> = {
  jeju: {
    code: 'jeju',
    name: '제주도',
    center: { lat: 33.3846, lng: 126.5535 },
    defaultZoom: 10,
    timezone: 'Asia/Seoul',
    defaultTravelMode: 'driving',
    searchBias: {
      sw: { lat: 33.11, lng: 126.14 },
      ne: { lat: 33.58, lng: 126.98 },
    },
  },
  seoul: {
    code: 'seoul',
    name: '서울',
    center: { lat: 37.5665, lng: 126.978 },
    defaultZoom: 12,
    timezone: 'Asia/Seoul',
    defaultTravelMode: 'transit',
  },
  // 해외 확장 예시. Naver Map은 국내만 지원하므로 이런 지역은 google로 강제된다.
  osaka: {
    code: 'osaka',
    name: '오사카',
    center: { lat: 34.6937, lng: 135.5023 },
    defaultZoom: 12,
    timezone: 'Asia/Tokyo',
    defaultTravelMode: 'transit',
  },
};

export const DEFAULT_REGION_CODE =
  process.env.NEXT_PUBLIC_DEFAULT_REGION ?? 'jeju';

export function getRegion(code: string): RegionConfig {
  return REGIONS[code] ?? REGIONS[DEFAULT_REGION_CODE] ?? REGIONS.jeju;
}

/** 한국 영역 밖이면 Naver Map 타일이 비므로 제공자 선택을 제한한다. */
export function isNaverSupported(region: RegionConfig): boolean {
  const { lat, lng } = region.center;
  return lat >= 33 && lat <= 39 && lng >= 124 && lng <= 132;
}

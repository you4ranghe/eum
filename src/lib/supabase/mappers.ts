import type { OpeningPeriod, Place, PlaceCategory } from '@/lib/domain/types';

/**
 * DB 행 ↔ 도메인 모델 변환.
 *
 * 굳이 매퍼를 두는 이유:
 * DB는 snake_case에 lat/lng를 평면 컬럼으로 두는 게 자연스럽고,
 * 도메인은 camelCase에 location: {lat,lng} 중첩이 자연스럽다.
 * 둘을 억지로 맞추면 한쪽이 계속 불편해진다.
 * 변환 지점을 이 파일 하나로 고정하면, 스키마가 바뀌어도 UI는 무사하다.
 */
export interface PlaceRow {
  id: string;
  provider: string;
  provider_id: string;
  name: string;
  address: string;
  road_address: string | null;
  lat: number;
  lng: number;
  category: PlaceCategory;
  phone: string | null;
  rating: number | null;
  region_code: string;
  timezone: string;
  always_open: boolean;
  opening_periods: OpeningPeriod[];
}

export function toPlace(row: PlaceRow): Place {
  return {
    id: row.id,
    name: row.name,
    address: row.address,
    roadAddress: row.road_address ?? undefined,
    location: { lat: row.lat, lng: row.lng },
    category: row.category,
    phone: row.phone ?? undefined,
    rating: row.rating ?? undefined,
    regionCode: row.region_code,
    timezone: row.timezone,
    alwaysOpen: row.always_open,
    openingPeriods: row.opening_periods ?? [],
    externalRefs:
      row.provider === 'naver'
        ? { naverPlaceId: row.provider_id }
        : row.provider === 'google'
          ? { googlePlaceId: row.provider_id }
          : undefined,
  };
}

export function toPlaceRow(place: Place, provider: string, providerId: string) {
  return {
    provider,
    provider_id: providerId,
    name: place.name,
    address: place.address,
    road_address: place.roadAddress ?? null,
    lat: place.location.lat,
    lng: place.location.lng,
    category: place.category,
    phone: place.phone ?? null,
    rating: place.rating ?? null,
    region_code: place.regionCode,
    timezone: place.timezone,
    always_open: place.alwaysOpen ?? false,
    opening_periods: place.openingPeriods ?? [],
    fetched_at: new Date().toISOString(),
  };
}

import type { LatLng, Place, TravelMode } from '@/lib/domain/types';

/**
 * 서버 측 외부 API 추상화.
 *
 * 지도 렌더링(MapAdapter)과 별개의 인터페이스를 둔 이유:
 * 렌더링 제공자와 데이터 제공자는 독립적으로 선택된다.
 * "네이버 지도 위에 구글 Places 결과를 그리기"가 실제로 유효한 조합이고,
 * 제주(네이버 데이터가 풍부)와 오사카(구글만 가능)를 한 앱에서 다루려면
 * 이 둘이 분리돼 있어야 한다.
 */
export interface PlaceSearchProvider {
  readonly id: 'naver' | 'google';
  search(params: {
    query: string;
    regionCode: string;
    near?: LatLng;
  }): Promise<Place[]>;
}

export interface RouteLegResult {
  distanceMeters: number;
  durationSeconds: number;
  path: LatLng[];
}

export interface DirectionsProvider {
  readonly id: 'naver' | 'google';
  supports(mode: TravelMode): boolean;
  route(params: {
    origin: LatLng;
    destination: LatLng;
    mode: TravelMode;
    departAt?: string;
  }): Promise<RouteLegResult>;
}

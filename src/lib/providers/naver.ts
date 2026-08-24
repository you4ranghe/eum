import type { Place, TravelMode } from '@/lib/domain/types';
import { getRegion } from '@/lib/geo/regions';
import type {
  DirectionsProvider,
  PlaceSearchProvider,
  RouteLegResult,
} from '@/lib/providers/types';

/**
 * ⚠️ 네이버는 두 개의 서로 다른 서비스로 나뉜다. 자격증명도 헤더도 완전히 별개다.
 * 이걸 하나로 착각하면 401만 계속 받으면서 원인을 못 찾는다.
 *
 * 1) 네이버 개발자센터 (developers.naver.com)
 *    - 검색 API (지역/Local) — openapi.naver.com
 *    - 헤더: X-Naver-Client-Id / X-Naver-Client-Secret
 *    - 무료, 결제수단 불필요
 *
 * 2) 네이버 클라우드 플랫폼 (ncloud.com)
 *    - 지도 표시(Web Dynamic Map), 길찾기(Directions), Geocoding — *.ntruss.com
 *    - 헤더: x-ncp-apigw-api-key-id / x-ncp-apigw-api-key
 *    - 유료(무료 한도 있음), 결제수단 등록 필수
 */

/** 네이버 개발자센터 — 검색 API용 */
const SEARCH_HEADERS = () => ({
  'X-Naver-Client-Id': process.env.NAVER_SEARCH_CLIENT_ID ?? '',
  'X-Naver-Client-Secret': process.env.NAVER_SEARCH_CLIENT_SECRET ?? '',
});

/** 네이버 클라우드 플랫폼 — 지도/길찾기 API용 */
const NCP_HEADERS = () => ({
  'x-ncp-apigw-api-key-id': process.env.NCP_API_KEY_ID ?? '',
  'x-ncp-apigw-api-key': process.env.NCP_API_KEY ?? '',
});

/** 네이버 Local Search. 국내 상호/주소 품질이 구글보다 높다. */
export const naverPlaceSearch: PlaceSearchProvider = {
  id: 'naver',
  async search({ query, regionCode }) {
    const region = getRegion(regionCode);
    const url = new URL('https://openapi.naver.com/v1/search/local.json');
    url.searchParams.set('query', `${region.name} ${query}`);
    url.searchParams.set('display', '5'); // 지역 검색은 최대 5건만 허용된다

    const res = await fetch(url, {
      headers: SEARCH_HEADERS(),
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`네이버 검색 실패: ${res.status}`);
    const data = (await res.json()) as { items: NaverLocalItem[] };

    return data.items.map((item) => toPlace(item, region.code, region.timezone));
  },
};

interface NaverLocalItem {
  title: string;
  address: string;
  roadAddress: string;
  telephone: string;
  mapx: string;
  mapy: string;
  category: string;
}

function toPlace(item: NaverLocalItem, regionCode: string, timezone: string): Place {
  return {
    // 아직 DB에 없는 검색 결과이므로 임시 ID를 쓴다.
    // 일정에 담는 순간 서버가 place 테이블에 upsert하고 진짜 UUID를 발급한다.
    id: `tmp_naver_${item.mapx}_${item.mapy}`,
    name: item.title.replace(/<[^>]+>/g, ''), // API가 하이라이트용 태그를 넣어준다
    address: item.address,
    roadAddress: item.roadAddress,
    // v1 local API의 mapx/mapy는 경위도에 1e7을 곱한 정수다
    location: { lat: Number(item.mapy) / 1e7, lng: Number(item.mapx) / 1e7 },
    category: mapCategory(item.category),
    phone: item.telephone || undefined,
    regionCode,
    timezone,
    // 주의: Local Search는 영업시간을 주지 않는다.
    // 영업 상태 표기는 구글 Places Details나 수동 입력으로 보강해야 한다.
    openingPeriods: [],
  };
}

function mapCategory(raw: string): Place['category'] {
  if (/음식점|한식|중식|일식|양식/.test(raw)) return 'restaurant';
  if (/카페|커피/.test(raw)) return 'cafe';
  if (/숙박|호텔|펜션|게스트/.test(raw)) return 'accommodation';
  if (/관광|명소|공원|해변/.test(raw)) return 'attraction';
  if (/쇼핑|마트|시장/.test(raw)) return 'shopping';
  return 'etc';
}

/** 네이버 Directions 5 — 국내 자동차 경로만 지원한다. */
export const naverDirections: DirectionsProvider = {
  id: 'naver',
  supports: (mode: TravelMode) => mode === 'driving',

  async route({ origin, destination }): Promise<RouteLegResult> {
    const url = new URL('https://maps.apigw.ntruss.com/map-direction/v1/driving');
    url.searchParams.set('start', `${origin.lng},${origin.lat}`);
    url.searchParams.set('goal', `${destination.lng},${destination.lat}`);
    url.searchParams.set('option', 'trafast'); // 실시간 빠른 길

    const res = await fetch(url, { headers: NCP_HEADERS() });
    if (!res.ok) throw new Error(`네이버 경로 실패: ${res.status}`);
    const data = await res.json();
    const route = data?.route?.trafast?.[0];
    if (!route) throw new Error('경로를 찾을 수 없습니다');

    return {
      distanceMeters: route.summary.distance,
      durationSeconds: Math.round(route.summary.duration / 1000), // ms로 내려온다
      path: (route.path as [number, number][]).map(([lng, lat]) => ({ lat, lng })),
    };
  },
};

import { NextResponse } from 'next/server';
import { getRegion, isNaverSupported } from '@/lib/geo/regions';
import { naverPlaceSearch } from '@/lib/providers/naver';
import { googlePlaceSearch } from '@/lib/providers/google';
import type { PlaceSearchProvider } from '@/lib/providers/types';

/**
 * GET /api/places/search?query=...&regionCode=jeju&lat=..&lng=..
 *
 * 왜 서버를 거치는가:
 * 1) 네이버 Local Search는 CORS를 허용하지 않고 시크릿 키를 요구한다.
 *    브라우저에서 직접 부르는 것은 불가능하고, 키를 노출하면 도용된다.
 * 2) 제공자별 응답 스키마를 Place 하나로 정규화하는 지점이 한 곳이어야 한다.
 *
 * 무료 티어 고려:
 * Vercel Hobby는 함수 실행 시간이 아니라 호출 수와 대역폭이 실질 한도다.
 * → 아래 revalidate로 동일 검색어를 CDN 캐시에 태워 호출 자체를 줄인다.
 */
export const revalidate = 300;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query')?.trim();
  const regionCode = searchParams.get('regionCode') ?? 'jeju';
  const lat = searchParams.get('lat');
  const lng = searchParams.get('lng');

  if (!query || query.length < 2) {
    return NextResponse.json(
      { message: '검색어는 2글자 이상이어야 합니다' },
      { status: 400 },
    );
  }

  const region = getRegion(regionCode);
  // 국내는 네이버가 정확하고, 해외는 네이버가 아예 결과를 주지 않는다.
  // 데이터 제공자 선택을 지역으로 자동 결정해 사용자가 신경 쓰지 않게 한다.
  const primary: PlaceSearchProvider = isNaverSupported(region)
    ? naverPlaceSearch
    : googlePlaceSearch;
  const fallback: PlaceSearchProvider =
    primary.id === 'naver' ? googlePlaceSearch : naverPlaceSearch;

  const near = lat && lng ? { lat: Number(lat), lng: Number(lng) } : undefined;

  try {
    const places = await primary.search({ query, regionCode, near });
    // 네이버는 결과는 주지만 영업시간이 없다. 비어 있으면 구글로 한 번 더 시도.
    if (places.length > 0) return NextResponse.json(places);
    const alt = await fallback.search({ query, regionCode, near });
    return NextResponse.json(alt);
  } catch (error) {
    // 한 제공자가 죽어도 검색 자체는 살아 있어야 한다.
    try {
      const alt = await fallback.search({ query, regionCode, near });
      return NextResponse.json(alt);
    } catch {
      const message = error instanceof Error ? error.message : '검색 실패';
      return NextResponse.json({ message }, { status: 502 });
    }
  }
}

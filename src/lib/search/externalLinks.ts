import type { Place } from '@/lib/domain/types';

/**
 * 장소 상세의 "네이버/구글에서 보기" 링크.
 *
 * 서버 프록시가 아니라 검색 URL을 여는 이유:
 * 네이버/구글 장소 상세 페이지는 iframe 임베드를 X-Frame-Options로 차단하고,
 * 크롤링 재가공은 약관 위반 소지가 있다. 새 창으로 정식 페이지를 여는 것이
 * 법적으로도 UX적으로도 가장 안전한 선택.
 *
 * 모달을 쓰고 싶다면 iframe이 아니라 "요약 정보(우리 DB) + 원문으로 이동 버튼"
 * 형태여야 한다 — PlaceDetailModal이 그 구조를 따른다.
 */
export function naverSearchUrl(place: Place): string {
  if (place.externalRefs?.naverPlaceId) {
    return `https://map.naver.com/p/entry/place/${place.externalRefs.naverPlaceId}`;
  }
  const q = encodeURIComponent(`${place.name} ${place.address}`);
  return `https://map.naver.com/p/search/${q}`;
}

export function googleSearchUrl(place: Place): string {
  if (place.externalRefs?.googlePlaceId) {
    return `https://www.google.com/maps/place/?q=place_id:${place.externalRefs.googlePlaceId}`;
  }
  const q = encodeURIComponent(`${place.name} ${place.address}`);
  return `https://www.google.com/maps/search/?api=1&query=${q}`;
}

/** 길찾기 딥링크 — 실제 내비게이션은 각 앱에 위임한다. */
export function naverDirectionsUrl(from: Place, to: Place): string {
  const enc = (s: string) => encodeURIComponent(s);
  return `https://map.naver.com/p/directions/${from.location.lng},${from.location.lat},${enc(from.name)}/${to.location.lng},${to.location.lat},${enc(to.name)}/-/car`;
}

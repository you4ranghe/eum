import type { LatLng, Place } from '@/lib/domain/types';
import { getRegion } from '@/lib/geo/regions';
import type {
  DirectionsProvider,
  PlaceSearchProvider,
  RouteLegResult,
} from '@/lib/providers/types';

const KEY = () => process.env.GOOGLE_MAPS_SERVER_KEY ?? '';

/**
 * Google Places API (New). 전 세계 커버리지 + 영업시간을 함께 준다.
 * fieldMask로 필요한 필드만 요청하는 게 중요하다 — 과금이 필드 등급 단위이기 때문.
 */
export const googlePlaceSearch: PlaceSearchProvider = {
  id: 'google',
  async search({ query, regionCode, near }) {
    const region = getRegion(regionCode);
    const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Goog-Api-Key': KEY(),
        'X-Goog-FieldMask': [
          'places.id',
          'places.displayName',
          'places.formattedAddress',
          'places.location',
          'places.primaryType',
          'places.rating',
          'places.nationalPhoneNumber',
          'places.regularOpeningHours',
        ].join(','),
      },
      body: JSON.stringify({
        textQuery: query,
        languageCode: 'ko',
        maxResultCount: 10,
        ...(near
          ? {
              locationBias: {
                circle: {
                  center: { latitude: near.lat, longitude: near.lng },
                  radius: 30000,
                },
              },
            }
          : {}),
      }),
      next: { revalidate: 300 },
    });

    if (!res.ok) throw new Error(`구글 검색 실패: ${res.status}`);
    const data = (await res.json()) as { places?: GooglePlace[] };

    return (data.places ?? []).map<Place>((p) => ({
      id: `tmp_google_${p.id}`,
      name: p.displayName?.text ?? '이름 없음',
      address: p.formattedAddress ?? '',
      location: { lat: p.location.latitude, lng: p.location.longitude },
      category: mapCategory(p.primaryType),
      phone: p.nationalPhoneNumber,
      rating: p.rating,
      regionCode: region.code,
      timezone: region.timezone,
      openingPeriods: toOpeningPeriods(p.regularOpeningHours),
      externalRefs: { googlePlaceId: p.id },
    }));
  },
};

interface GooglePlace {
  id: string;
  displayName?: { text: string };
  formattedAddress?: string;
  location: { latitude: number; longitude: number };
  primaryType?: string;
  rating?: number;
  nationalPhoneNumber?: string;
  regularOpeningHours?: {
    periods?: Array<{
      open: { day: number; hour: number; minute: number };
      close?: { day: number; hour: number; minute: number };
    }>;
  };
}

/** 구글의 day/hour/minute 구조를 우리 도메인의 "HH:mm"으로 정규화 */
function toOpeningPeriods(hours: GooglePlace['regularOpeningHours']) {
  const pad = (n: number) => String(n).padStart(2, '0');
  return (hours?.periods ?? [])
    .filter((p) => p.close)
    .map((p) => ({
      dayOfWeek: p.open.day, // 구글도 0=일요일이라 그대로 매칭된다
      open: `${pad(p.open.hour)}:${pad(p.open.minute)}`,
      close: `${pad(p.close!.hour)}:${pad(p.close!.minute)}`,
    }));
}

function mapCategory(type?: string): Place['category'] {
  if (!type) return 'etc';
  if (/restaurant|food/.test(type)) return 'restaurant';
  if (/cafe|coffee/.test(type)) return 'cafe';
  if (/lodging|hotel/.test(type)) return 'accommodation';
  if (/tourist|park|museum|beach/.test(type)) return 'attraction';
  if (/store|shopping|market/.test(type)) return 'shopping';
  if (/station|airport|transit/.test(type)) return 'transport';
  return 'etc';
}

/** Google Routes API — 도보/대중교통까지 커버하는 유일한 선택지. */
export const googleDirections: DirectionsProvider = {
  id: 'google',
  supports: () => true,

  async route({ origin, destination, mode, departAt }): Promise<RouteLegResult> {
    const res = await fetch(
      'https://routes.googleapis.com/directions/v2:computeRoutes',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Goog-Api-Key': KEY(),
          'X-Goog-FieldMask':
            'routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline',
        },
        body: JSON.stringify({
          origin: {
            location: { latLng: { latitude: origin.lat, longitude: origin.lng } },
          },
          destination: {
            location: {
              latLng: { latitude: destination.lat, longitude: destination.lng },
            },
          },
          travelMode: { driving: 'DRIVE', walking: 'WALK', transit: 'TRANSIT' }[mode],
          // 대중교통과 실시간 교통은 출발 시각이 있어야 의미 있는 값이 나온다.
          ...(departAt ? { departureTime: departAt } : {}),
          languageCode: 'ko',
        }),
      },
    );

    if (!res.ok) throw new Error(`구글 경로 실패: ${res.status}`);
    const data = await res.json();
    const route = data?.routes?.[0];
    if (!route) throw new Error('경로를 찾을 수 없습니다');

    return {
      distanceMeters: route.distanceMeters,
      durationSeconds: Number(String(route.duration).replace('s', '')),
      path: decodePolyline(route.polyline.encodedPolyline),
    };
  },
};

/**
 * Google Encoded Polyline 디코더.
 * 전용 패키지를 쓰지 않고 직접 구현한 이유:
 * 20줄짜리 알고리즘에 의존성을 추가하면 번들과 취약점 관리 대상만 늘어난다.
 */
function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    for (const target of ['lat', 'lng'] as const) {
      let shift = 0;
      let result = 0;
      let byte: number;
      do {
        byte = encoded.charCodeAt(index++) - 63;
        result |= (byte & 0x1f) << shift;
        shift += 5;
      } while (byte >= 0x20);
      const delta = result & 1 ? ~(result >> 1) : result >> 1;
      if (target === 'lat') lat += delta;
      else lng += delta;
    }
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }
  return points;
}

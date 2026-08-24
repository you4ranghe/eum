import { getRegion, isNaverSupported } from '@/lib/geo/regions';
import { GoogleMapAdapter } from '@/lib/map/providers/GoogleMapAdapter';
import { NaverMapAdapter } from '@/lib/map/providers/NaverMapAdapter';
import type { MapAdapter, MapProviderId, MapProviderMeta } from '@/lib/map/types';

/**
 * 제공자 팩토리 (Registry Pattern).
 *
 * 컴포넌트는 `createMapAdapter(providerId)`만 호출한다.
 * 새 제공자(Kakao, Mapbox)를 붙일 때 수정할 곳은 이 파일 한 곳뿐 —
 * 어댑터 인터페이스를 만족하기만 하면 UI는 손대지 않는다.
 */
const FACTORIES: Record<MapProviderId, () => MapAdapter> = {
  naver: () => new NaverMapAdapter(),
  google: () => new GoogleMapAdapter(),
};

export function createMapAdapter(id: MapProviderId): MapAdapter {
  return FACTORIES[id]();
}

/**
 * 현재 지역에서 고를 수 있는 제공자 목록 + 비활성 사유.
 * 탭 UI는 이 결과만 렌더링하면 되므로 "제주에선 둘 다, 오사카에선 구글만"이
 * 자동으로 처리된다.
 */
export function getAvailableProviders(regionCode: string): MapProviderMeta[] {
  const region = getRegion(regionCode);
  return [
    {
      id: 'naver',
      label: '네이버 지도',
      unavailableReason: isNaverSupported(region)
        ? undefined
        : `${region.name}은(는) 네이버 지도 미지원 지역입니다`,
    },
    { id: 'google', label: '구글 지도' },
  ];
}

/** 지역이 바뀌었을 때 현재 제공자를 유지할 수 있는지 판단해 안전한 값을 돌려준다. */
export function resolveProviderForRegion(
  desired: MapProviderId,
  regionCode: string,
): MapProviderId {
  const meta = getAvailableProviders(regionCode).find((p) => p.id === desired);
  return meta && !meta.unavailableReason ? desired : 'google';
}

'use client';

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { LatLng } from '@/lib/domain/types';
import { DEFAULT_REGION_CODE, getRegion } from '@/lib/geo/regions';
import { resolveProviderForRegion } from '@/lib/map/registry';
import type { MapProviderId } from '@/lib/map/types';

/**
 * 지도 "표시 상태" 저장소.
 *
 * 어댑터 인스턴스를 여기 두지 않는 이유:
 * 어댑터는 DOM/SDK를 쥔 가변 객체라 직렬화도 불가능하고 persist와 충돌한다.
 * → 스토어에는 '무엇을 보여줄지'(제공자 ID, 지역, 선택 상태)만 두고,
 *   '어떻게 그릴지'(어댑터 인스턴스)는 MapCanvas의 ref가 소유한다.
 *   상태와 부수효과 소유권을 분리해야 제공자 전환이 예측 가능해진다.
 */
interface MapState {
  provider: MapProviderId;
  regionCode: string;
  center: LatLng;
  zoom: number;
  /** 지도에서 강조할 대상 (사이드바 hover/클릭과 연동) */
  focusedStopId: string | null;
  focusedPlaceId: string | null;

  setProvider: (provider: MapProviderId) => void;
  setRegion: (regionCode: string) => void;
  setView: (center: LatLng, zoom: number) => void;
  focusStop: (stopId: string | null) => void;
  focusPlace: (placeId: string | null) => void;
}

const initialRegion = getRegion(DEFAULT_REGION_CODE);
const initialProvider = resolveProviderForRegion(
  (process.env.NEXT_PUBLIC_DEFAULT_MAP_PROVIDER as MapProviderId) ?? 'naver',
  DEFAULT_REGION_CODE,
);

export const useMapStore = create<MapState>()(
  persist(
    (set, get) => ({
      provider: initialProvider,
      regionCode: initialRegion.code,
      center: initialRegion.center,
      zoom: initialRegion.defaultZoom,
      focusedStopId: null,
      focusedPlaceId: null,

      setProvider: (provider) =>
        // 지역이 지원하지 않는 제공자로의 전환을 스토어 레벨에서 차단한다.
        // (UI가 실수로 허용해도 잘못된 상태가 만들어지지 않도록 방어)
        set({ provider: resolveProviderForRegion(provider, get().regionCode) }),

      setRegion: (regionCode) => {
        const region = getRegion(regionCode);
        set({
          regionCode: region.code,
          center: region.center,
          zoom: region.defaultZoom,
          provider: resolveProviderForRegion(get().provider, region.code),
        });
      },

      setView: (center, zoom) => set({ center, zoom }),
      focusStop: (focusedStopId) => set({ focusedStopId }),
      focusPlace: (focusedPlaceId) => set({ focusedPlaceId }),
    }),
    {
      name: 'eum:map',
      // 마지막 본 위치까지 저장하면 새로고침 시 사용자 맥락이 유지된다.
      partialize: (s) => ({
        provider: s.provider,
        regionCode: s.regionCode,
        center: s.center,
        zoom: s.zoom,
      }),
    },
  ),
);

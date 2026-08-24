import type { Bounds, LatLng } from '@/lib/domain/types';

export type MapProviderId = 'naver' | 'google';

export interface MarkerOptions {
  id: string;
  position: LatLng;
  /** 마커에 표시할 순번 라벨 (일정 1, 2, 3...) */
  label?: string;
  /** 선택 상태 강조 */
  active?: boolean;
  color?: string;
  onClick?: (id: string) => void;
}

export interface PolylineOptions {
  id: string;
  path: LatLng[];
  color?: string;
  /** 실제 경로 API 결과가 아닌 직선 폴백일 때 점선으로 그린다 */
  dashed?: boolean;
}

export interface MapInitOptions {
  center: LatLng;
  zoom: number;
  onIdle?: (bounds: Bounds, zoom: number) => void;
  onClick?: (position: LatLng) => void;
}

/**
 * ─────────────────────────────────────────────────────────────
 * 지도 제공자 어댑터 인터페이스 (Adapter Pattern)
 *
 * 설계 의도:
 * Naver와 Google의 SDK는 좌표 클래스(naver.maps.LatLng vs google.maps.LatLng),
 * 마커 생성 방식, 이벤트 바인딩이 전부 다르다. UI 컴포넌트가 이 차이를 알게 되면
 * 제공자 추가/교체 때마다 컴포넌트를 전부 수정해야 한다.
 *
 * 그래서 "지도에 대해 우리 앱이 필요로 하는 최소 동작"만 이 인터페이스로 고정하고,
 * SDK 차이는 각 어댑터 안에 가둔다. 컴포넌트는 MapAdapter만 알면 되고,
 * 나중에 Mapbox/Kakao를 추가해도 이 파일은 바뀌지 않는다.
 *
 * 메서드를 명령형(imperative)으로 둔 이유:
 * 지도 SDK는 React 렌더링 밖에서 자체 DOM을 관리하는 비-React 세계다.
 * 이를 선언형으로 감싸려다 보면 diffing을 직접 구현하게 되므로,
 * "React가 상태를 갖고 → 어댑터에 명령을 내린다"는 단방향 흐름이 더 단순하다.
 * ─────────────────────────────────────────────────────────────
 */
export interface MapAdapter {
  readonly id: MapProviderId;

  /** SDK 스크립트 로드 + 지도 인스턴스 생성. 컨테이너 DOM은 React가 소유. */
  init(container: HTMLElement, options: MapInitOptions): Promise<void>;

  /** 지도 인스턴스와 리스너 정리. 제공자 전환/언마운트 시 반드시 호출. */
  destroy(): void;

  setCenter(center: LatLng, zoom?: number): void;
  getCenter(): LatLng | null;
  getZoom(): number | null;

  /**
   * 마커 전체 동기화 (add/update/remove를 개별 노출하지 않는 이유:
   * 호출부가 diff를 관리하게 되면 중복 로직이 생긴다. 어댑터가 내부에서 diff한다.)
   */
  renderMarkers(markers: MarkerOptions[]): void;

  /** 동선 폴리라인 전체 동기화 */
  renderPolylines(lines: PolylineOptions[]): void;

  /** 해당 좌표들이 모두 보이도록 뷰포트 조정 (날짜 탭 전환 시 사용) */
  fitBounds(points: LatLng[], paddingPx?: number): void;

  /** 이 제공자가 해당 지역을 지원하는지 (Naver는 국내 한정) */
  supportsRegion(regionCode: string): boolean;
}

export interface MapProviderMeta {
  id: MapProviderId;
  label: string;
  /** 탭 UI에서 비활성 사유를 보여주기 위한 값 */
  unavailableReason?: string;
}

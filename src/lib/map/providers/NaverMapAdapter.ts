import type { Bounds, LatLng } from '@/lib/domain/types';
import { getRegion, isNaverSupported } from '@/lib/geo/regions';
import { loadScript } from '@/lib/map/loader';
import type {
  MapAdapter,
  MapInitOptions,
  MarkerOptions,
  PolylineOptions,
} from '@/lib/map/types';

/**
 * naver.maps 전역은 공식 타입 패키지가 없어 최소한만 선언한다.
 * (any를 어댑터 내부에 가둬두면 앱의 나머지는 타입 안전을 유지한다 — 격리의 핵심 이점)
 */
declare global {
  interface Window {
    naver?: any;
  }
}

const SDK_URL = (clientId: string) =>
  `https://oapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${clientId}`;

export class NaverMapAdapter implements MapAdapter {
  readonly id = 'naver' as const;

  private map: any = null;
  private markers = new Map<string, any>();
  private polylines = new Map<string, any>();
  private listeners: any[] = [];

  async init(container: HTMLElement, options: MapInitOptions): Promise<void> {
    const clientId = process.env.NEXT_PUBLIC_NCP_MAP_KEY_ID;
    if (!clientId) throw new Error('NEXT_PUBLIC_NCP_MAP_KEY_ID 미설정');

    await loadScript(SDK_URL(clientId));
    const naver = window.naver;
    if (!naver?.maps) throw new Error('naver.maps 전역을 찾을 수 없음');

    this.map = new naver.maps.Map(container, {
      center: new naver.maps.LatLng(options.center.lat, options.center.lng),
      zoom: options.zoom,
      zoomControl: true,
      zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
    });

    if (options.onIdle) {
      this.listeners.push(
        naver.maps.Event.addListener(this.map, 'idle', () => {
          const b = this.map.getBounds();
          const bounds: Bounds = {
            sw: { lat: b.getSW().lat(), lng: b.getSW().lng() },
            ne: { lat: b.getNE().lat(), lng: b.getNE().lng() },
          };
          options.onIdle!(bounds, this.map.getZoom());
        }),
      );
    }
    if (options.onClick) {
      this.listeners.push(
        naver.maps.Event.addListener(this.map, 'click', (e: any) => {
          options.onClick!({ lat: e.coord.lat(), lng: e.coord.lng() });
        }),
      );
    }
  }

  destroy(): void {
    const naver = window.naver;
    this.listeners.forEach((l) => naver?.maps?.Event?.removeListener(l));
    this.listeners = [];
    this.markers.forEach((m) => m.setMap(null));
    this.markers.clear();
    this.polylines.forEach((p) => p.setMap(null));
    this.polylines.clear();
    this.map?.destroy?.();
    this.map = null;
  }

  setCenter(center: LatLng, zoom?: number): void {
    if (!this.map) return;
    this.map.setCenter(new window.naver.maps.LatLng(center.lat, center.lng));
    if (zoom != null) this.map.setZoom(zoom);
  }

  getCenter(): LatLng | null {
    if (!this.map) return null;
    const c = this.map.getCenter();
    return { lat: c.lat(), lng: c.lng() };
  }

  getZoom(): number | null {
    return this.map?.getZoom() ?? null;
  }

  renderMarkers(next: MarkerOptions[]): void {
    if (!this.map) return;
    const naver = window.naver;
    const nextIds = new Set(next.map((m) => m.id));

    // 사라진 마커 제거
    for (const [id, marker] of this.markers) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        this.markers.delete(id);
      }
    }

    // 매번 새로 만들지 않고 위치/아이콘만 갱신 → 날짜 탭 전환 시 깜빡임 방지
    for (const opt of next) {
      const position = new naver.maps.LatLng(opt.position.lat, opt.position.lng);
      const icon = { content: markerHtml(opt), anchor: new naver.maps.Point(16, 16) };
      const existing = this.markers.get(opt.id);
      if (existing) {
        existing.setPosition(position);
        existing.setIcon(icon);
        continue;
      }
      const marker = new naver.maps.Marker({ map: this.map, position, icon });
      if (opt.onClick) {
        naver.maps.Event.addListener(marker, 'click', () => opt.onClick!(opt.id));
      }
      this.markers.set(opt.id, marker);
    }
  }

  renderPolylines(next: PolylineOptions[]): void {
    if (!this.map) return;
    const naver = window.naver;
    const nextIds = new Set(next.map((l) => l.id));

    for (const [id, line] of this.polylines) {
      if (!nextIds.has(id)) {
        line.setMap(null);
        this.polylines.delete(id);
      }
    }

    for (const opt of next) {
      this.polylines.get(opt.id)?.setMap(null);
      const line = new naver.maps.Polyline({
        map: this.map,
        path: opt.path.map((p) => new naver.maps.LatLng(p.lat, p.lng)),
        strokeColor: opt.color ?? '#2563eb',
        strokeWeight: 4,
        strokeOpacity: 0.9,
        strokeStyle: opt.dashed ? 'shortdash' : 'solid',
      });
      this.polylines.set(opt.id, line);
    }
  }

  fitBounds(points: LatLng[], paddingPx = 60): void {
    if (!this.map || points.length === 0) return;
    const naver = window.naver;
    if (points.length === 1) {
      this.setCenter(points[0], 14);
      return;
    }
    const bounds = new naver.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(new naver.maps.LatLng(p.lat, p.lng)));
    this.map.fitBounds(bounds, {
      top: paddingPx, right: paddingPx, bottom: paddingPx, left: paddingPx,
    });
  }

  supportsRegion(regionCode: string): boolean {
    return isNaverSupported(getRegion(regionCode));
  }
}

/** 순번이 보이는 원형 마커. 제공자별 오버레이 문법이 달라 어댑터 안에 둔다. */
function markerHtml(opt: MarkerOptions): string {
  const bg = opt.active ? '#1d4ed8' : (opt.color ?? '#2563eb');
  const size = opt.active ? 34 : 28;
  return `<div style="
    width:${size}px;height:${size}px;border-radius:50%;
    background:${bg};color:#fff;border:2px solid #fff;
    box-shadow:0 1px 4px rgba(0,0,0,.35);
    display:flex;align-items:center;justify-content:center;
    font:600 13px/1 system-ui,sans-serif;">${opt.label ?? ''}</div>`;
}

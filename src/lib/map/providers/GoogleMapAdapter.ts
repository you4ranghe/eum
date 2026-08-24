import type { Bounds, LatLng } from '@/lib/domain/types';
import { loadScript, waitForGlobal } from '@/lib/map/loader';
import type {
  MapAdapter,
  MapInitOptions,
  MarkerOptions,
  PolylineOptions,
} from '@/lib/map/types';

const SDK_URL = (key: string) =>
  `https://maps.googleapis.com/maps/api/js?key=${key}&libraries=places,geometry&language=ko&loading=async`;

export class GoogleMapAdapter implements MapAdapter {
  readonly id = 'google' as const;

  private map: google.maps.Map | null = null;
  private markers = new Map<string, google.maps.Marker>();
  private polylines = new Map<string, google.maps.Polyline>();
  private listeners: google.maps.MapsEventListener[] = [];

  async init(container: HTMLElement, options: MapInitOptions): Promise<void> {
    const key = process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY;
    if (!key) throw new Error('NEXT_PUBLIC_GOOGLE_MAPS_API_KEY 미설정');

    await loadScript(SDK_URL(key));
    // loading=async 사용 시 script onload 시점에 google.maps.Map이 아직 없을 수 있다.
    await waitForGlobal(() => typeof window.google?.maps?.Map === 'function');

    this.map = new google.maps.Map(container, {
      center: options.center,
      zoom: options.zoom,
      disableDefaultUI: false,
      mapTypeControl: false,
      streetViewControl: false,
      fullscreenControl: false,
      clickableIcons: false,
    });

    if (options.onIdle) {
      this.listeners.push(
        this.map.addListener('idle', () => {
          const b = this.map!.getBounds();
          if (!b) return;
          const bounds: Bounds = {
            sw: { lat: b.getSouthWest().lat(), lng: b.getSouthWest().lng() },
            ne: { lat: b.getNorthEast().lat(), lng: b.getNorthEast().lng() },
          };
          options.onIdle!(bounds, this.map!.getZoom() ?? options.zoom);
        }),
      );
    }
    if (options.onClick) {
      this.listeners.push(
        this.map.addListener('click', (e: google.maps.MapMouseEvent) => {
          if (e.latLng) options.onClick!({ lat: e.latLng.lat(), lng: e.latLng.lng() });
        }),
      );
    }
  }

  destroy(): void {
    this.listeners.forEach((l) => l.remove());
    this.listeners = [];
    this.markers.forEach((m) => m.setMap(null));
    this.markers.clear();
    this.polylines.forEach((p) => p.setMap(null));
    this.polylines.clear();
    this.map = null; // Google Maps는 명시적 destroy가 없다. 컨테이너 DOM 제거로 GC 유도.
  }

  setCenter(center: LatLng, zoom?: number): void {
    if (!this.map) return;
    this.map.setCenter(center);
    if (zoom != null) this.map.setZoom(zoom);
  }

  getCenter(): LatLng | null {
    const c = this.map?.getCenter();
    return c ? { lat: c.lat(), lng: c.lng() } : null;
  }

  getZoom(): number | null {
    return this.map?.getZoom() ?? null;
  }

  renderMarkers(next: MarkerOptions[]): void {
    if (!this.map) return;
    const nextIds = new Set(next.map((m) => m.id));

    for (const [id, marker] of this.markers) {
      if (!nextIds.has(id)) {
        marker.setMap(null);
        this.markers.delete(id);
      }
    }

    for (const opt of next) {
      const existing = this.markers.get(opt.id);
      const icon = numberedIcon(opt);
      if (existing) {
        existing.setPosition(opt.position);
        existing.setIcon(icon);
        existing.setLabel(labelFor(opt));
        continue;
      }
      const marker = new google.maps.Marker({
        map: this.map,
        position: opt.position,
        icon,
        label: labelFor(opt),
        zIndex: opt.active ? 999 : undefined,
      });
      if (opt.onClick) marker.addListener('click', () => opt.onClick!(opt.id));
      this.markers.set(opt.id, marker);
    }
  }

  renderPolylines(next: PolylineOptions[]): void {
    if (!this.map) return;
    const nextIds = new Set(next.map((l) => l.id));

    for (const [id, line] of this.polylines) {
      if (!nextIds.has(id)) {
        line.setMap(null);
        this.polylines.delete(id);
      }
    }

    for (const opt of next) {
      this.polylines.get(opt.id)?.setMap(null);
      const line = new google.maps.Polyline({
        map: this.map,
        path: opt.path,
        strokeColor: opt.color ?? '#2563eb',
        strokeWeight: opt.dashed ? 0 : 4,
        strokeOpacity: opt.dashed ? 0 : 0.9,
        icons: opt.dashed
          ? [{
              icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.8, scale: 3 },
              offset: '0',
              repeat: '12px',
            }]
          : undefined,
      });
      this.polylines.set(opt.id, line);
    }
  }

  fitBounds(points: LatLng[], paddingPx = 60): void {
    if (!this.map || points.length === 0) return;
    if (points.length === 1) {
      this.setCenter(points[0], 14);
      return;
    }
    const bounds = new google.maps.LatLngBounds();
    points.forEach((p) => bounds.extend(p));
    this.map.fitBounds(bounds, paddingPx);
  }

  /** Google Maps는 전 세계를 커버하므로 항상 true. 확장의 기본값이 되는 제공자. */
  supportsRegion(): boolean {
    return true;
  }
}

function labelFor(opt: MarkerOptions): google.maps.MarkerLabel | undefined {
  if (!opt.label) return undefined;
  return { text: opt.label, color: '#ffffff', fontSize: '12px', fontWeight: '600' };
}

function numberedIcon(opt: MarkerOptions): google.maps.Symbol {
  return {
    path: google.maps.SymbolPath.CIRCLE,
    scale: opt.active ? 16 : 13,
    fillColor: opt.active ? '#1d4ed8' : (opt.color ?? '#2563eb'),
    fillOpacity: 1,
    strokeColor: '#ffffff',
    strokeWeight: 2,
  };
}

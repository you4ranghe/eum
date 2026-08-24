'use client';

import { useEffect, useMemo } from 'react';
import type { Place } from '@/lib/domain/types';
import { getOpenStatus } from '@/lib/time/openingHours';
import { googleSearchUrl, naverSearchUrl } from '@/lib/search/externalLinks';
import { OpenBadge } from '@/components/common/OpenBadge';
import { useMapStore } from '@/store/useMapStore';
import { useTripStore } from '@/store/useTripStore';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

/**
 * ─────────────────────────────────────────────────────────────
 * 장소 상세 모달.
 *
 * 요구사항은 "네이버/구글 검색 결과를 새 창 또는 인앱 모달로"였다.
 * iframe 임베드를 쓰지 않은 이유:
 * 네이버·구글 지도 상세 페이지는 X-Frame-Options / CSP frame-ancestors로
 * 외부 임베드를 차단한다. iframe을 넣으면 개발 중에는 빈 화면,
 * 운영에서는 조용한 실패가 된다. 크롤링해서 재구성하는 것도 약관 위반 소지가 크다.
 *
 * → 실제로 동작하는 형태는 "우리가 가진 정보를 모달에 보여주고,
 *   원문은 새 탭으로 넘기는" 하이브리드다.
 *   사용자는 앱을 떠나지 않은 채 판단에 필요한 정보를 얻고,
 *   더 깊은 정보(리뷰/사진)가 필요할 때만 원문으로 간다.
 * ─────────────────────────────────────────────────────────────
 */
export function PlaceDetailModal() {
  const focusedPlaceId = useMapStore((s) => s.focusedPlaceId);
  const focusPlace = useMapStore((s) => s.focusPlace);
  const trip = useTripStore((s) => s.trip);

  // 일정에 담긴 장소에서 먼저 찾는다. 검색 결과 상세는 SearchPanel이 전달하는 구조로 확장 가능.
  const place: Place | null = useMemo(() => {
    if (!focusedPlaceId || !trip) return null;
    for (const day of trip.days) {
      const found = day.stops.find((s) => s.place.id === focusedPlaceId);
      if (found) return found.place;
    }
    return null;
  }, [focusedPlaceId, trip]);

  // ESC로 닫기 — 모달의 기본 기대 동작이다.
  useEffect(() => {
    if (!place) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && focusPlace(null);
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [place, focusPlace]);

  if (!place) return null;
  const status = getOpenStatus(place);

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${place.name} 상세 정보`}
      className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4"
      onClick={() => focusPlace(null)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md overflow-hidden rounded-xl bg-surface shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div className="min-w-0">
            <h2 className="truncate text-base font-bold">{place.name}</h2>
            <p className="mt-0.5 truncate text-xs text-gray-500">
              {place.roadAddress ?? place.address}
            </p>
          </div>
          <button
            onClick={() => focusPlace(null)}
            aria-label="닫기"
            className="shrink-0 text-gray-400 hover:text-gray-700"
          >
            ✕
          </button>
        </header>

        <div className="space-y-3 p-4">
          <div className="flex flex-wrap items-center gap-2">
            <OpenBadge status={status} />
            {place.phone && (
              <a href={`tel:${place.phone}`} className="text-xs text-brand hover:underline">
                {place.phone}
              </a>
            )}
          </div>

          {place.openingPeriods && place.openingPeriods.length > 0 && (
            <section>
              <h3 className="mb-1 text-xs font-semibold text-gray-700">영업시간</h3>
              <ul className="space-y-0.5 text-xs text-gray-600">
                {[...place.openingPeriods]
                  .sort((a, b) => a.dayOfWeek - b.dayOfWeek)
                  .map((p, i) => (
                    <li key={i} className="flex gap-3">
                      <span className="w-6 text-gray-400">{WEEKDAYS[p.dayOfWeek]}</span>
                      <span>
                        {p.open} – {p.close}
                      </span>
                    </li>
                  ))}
              </ul>
            </section>
          )}
        </div>

        {/* 원문으로 이동. rel="noreferrer"는 새 탭이 opener를 조작하지 못하게 막는다. */}
        <footer className="grid grid-cols-2 gap-2 border-t border-border p-3">
          <a
            href={naverSearchUrl(place)}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-surface-muted"
          >
            네이버에서 보기
          </a>
          <a
            href={googleSearchUrl(place)}
            target="_blank"
            rel="noreferrer noopener"
            className="rounded-lg border border-border px-3 py-2 text-center text-sm font-medium text-gray-700 hover:bg-surface-muted"
          >
            구글에서 보기
          </a>
        </footer>
      </div>
    </div>
  );
}

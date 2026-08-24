'use client';

import clsx from 'clsx';
import { useMapStore } from '@/store/useMapStore';
import { getAvailableProviders } from '@/lib/map/registry';

/**
 * 지도 제공자 전환 탭.
 *
 * 지역이 지원하지 않는 제공자는 숨기지 않고 '비활성 + 사유 표시'로 둔다.
 * 사라지는 UI는 사용자에게 버그처럼 보이고, 왜 못 쓰는지 학습할 기회를 없앤다.
 */
export function MapProviderTabs() {
  const provider = useMapStore((s) => s.provider);
  const regionCode = useMapStore((s) => s.regionCode);
  const setProvider = useMapStore((s) => s.setProvider);

  const providers = getAvailableProviders(regionCode);

  return (
    <div
      role="tablist"
      aria-label="지도 제공자"
      className="inline-flex rounded-lg border border-border bg-surface p-1 shadow-md"
    >
      {providers.map((p) => {
        const disabled = Boolean(p.unavailableReason);
        const active = provider === p.id;
        return (
          <button
            key={p.id}
            role="tab"
            aria-selected={active}
            disabled={disabled}
            title={p.unavailableReason}
            onClick={() => setProvider(p.id)}
            className={clsx(
              'rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
              active && 'bg-brand text-white',
              !active && !disabled && 'text-gray-600 hover:bg-surface-muted',
              disabled && 'cursor-not-allowed text-gray-300',
            )}
          >
            {p.label}
          </button>
        );
      })}
    </div>
  );
}

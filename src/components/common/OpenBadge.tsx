import clsx from 'clsx';
import type { OpenStatus } from '@/lib/domain/types';

/**
 * 영업 상태 배지.
 * 색만으로 구분하지 않고 항상 텍스트를 함께 둔다 —
 * 색각 이상 사용자와 흑백 출력에서도 정보가 살아 있어야 한다.
 */
export function OpenBadge({ status }: { status: OpenStatus }) {
  return (
    <span
      className={clsx(
        'inline-flex items-center rounded px-1.5 py-0.5 text-[11px] font-medium',
        status.state === 'open' && 'bg-emerald-50 text-emerald-700',
        status.state === 'closing_soon' && 'bg-amber-50 text-amber-700',
        status.state === 'closed' && 'bg-gray-100 text-gray-500',
        status.state === 'unknown' && 'bg-gray-50 text-gray-400',
      )}
    >
      {status.label}
    </span>
  );
}

'use client';

import Link from 'next/link';
import { displayName, useUser } from '@/lib/auth/useUser';
import { signOut } from '@/lib/auth/actions';

/**
 * 사이드바 헤더의 로그인 상태 표시.
 *
 * 미로그인 상태에서도 앱을 쓸 수 있게 두는 이유:
 * 여행 계획은 "일단 짜보다가" 시작한다. 첫 화면에서 로그인을 요구하면
 * 아직 쓸지 말지 정하지 않은 사용자를 그 자리에서 잃는다.
 * → 목 데이터로 먼저 만져보게 하고, 저장이 필요한 순간에 로그인을 권한다.
 *
 * Supabase 미설정(개발 초기)일 때는 로그인 UI 자체를 숨긴다.
 * 눌러도 반드시 실패할 버튼을 보여주는 건 UI가 아니라 함정이다.
 */
export function AuthStatus() {
  const { user, loading, unavailable } = useUser();

  if (unavailable) return null;

  // 확인 중에는 자리만 잡아둔다. 여기서 로그인 버튼을 그리면
  // 로그인된 사용자에게 잠깐 '로그인' 버튼이 번쩍였다 사라진다.
  if (loading) {
    return <span className="h-7 w-16 animate-pulse rounded bg-surface-muted" aria-hidden="true" />;
  }

  if (!user) {
    return (
      <Link
        href="/login"
        className="rounded-md border border-brand px-2.5 py-1 text-xs font-medium text-brand hover:bg-brand-soft"
      >
        로그인
      </Link>
    );
  }

  return (
    <div className="flex items-center gap-1.5">
      <span className="max-w-[7rem] truncate text-xs text-gray-600" title={user.email ?? ''}>
        {displayName(user)}
      </span>
      <button
        type="button"
        onClick={() => void signOut()}
        className="rounded-md border border-border px-2 py-1 text-xs text-gray-500 hover:bg-surface-muted"
      >
        로그아웃
      </button>
    </div>
  );
}

/**
 * 미로그인 사용자에게 저장이 안 된다는 사실을 알린다.
 *
 * 이 배너가 없으면 사용자는 일정을 열심히 짜고 새로고침한 뒤
 * 전부 사라진 것을 발견하게 된다. 그 시점의 이탈은 회복되지 않는다.
 */
export function GuestBanner() {
  const { user, loading, unavailable } = useUser();
  if (unavailable || loading || user) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
      둘러보는 중입니다 — 지금 만든 일정은 저장되지 않습니다.{' '}
      <Link href="/login" className="font-semibold underline underline-offset-2">
        로그인하기
      </Link>
    </div>
  );
}

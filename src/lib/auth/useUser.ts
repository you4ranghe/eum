'use client';

import { useEffect, useState } from 'react';
import type { User } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export interface UserState {
  user: User | null;
  /** 아직 확인 중. 이 값을 무시하면 로그인 상태인데도 잠깐 로그아웃 UI가 번쩍인다. */
  loading: boolean;
  /** Supabase 미설정(개발 초기). 로그인 UI 자체를 숨기는 근거로 쓴다. */
  unavailable: boolean;
}

/**
 * 현재 로그인 사용자.
 *
 * onAuthStateChange를 함께 구독하는 이유:
 * 다른 탭에서 로그아웃하거나 토큰이 만료되면 이 탭의 상태는 낡은 채로 남는다.
 * 사용자는 "로그인돼 있는데 저장이 안 되는" 상황을 만나게 된다.
 * 구독해 두면 그 순간 UI가 따라간다.
 *
 * 최초 1회는 getUser()로 서버에 검증을 요청한다.
 * getSession()은 쿠키를 그대로 믿기 때문에 표시 목적 외에는 쓰지 않는다.
 */
export function useUser(): UserState {
  const [state, setState] = useState<UserState>({
    user: null,
    loading: true,
    unavailable: false,
  });

  useEffect(() => {
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
      setState({ user: null, loading: false, unavailable: true });
      return;
    }

    const supabase = createClient();
    let alive = true;

    supabase.auth.getUser().then(({ data }) => {
      if (alive) setState({ user: data.user, loading: false, unavailable: false });
    });

    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (alive) {
        setState({ user: session?.user ?? null, loading: false, unavailable: false });
      }
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}

/** 표시용 이름. 소셜 제공자마다 메타데이터 키가 달라 한 곳에서 흡수한다. */
export function displayName(user: User): string {
  const meta = user.user_metadata ?? {};
  return (
    meta.name ??
    meta.full_name ??
    meta.nickname ??
    meta.preferred_username ??
    user.email?.split('@')[0] ??
    '사용자'
  );
}

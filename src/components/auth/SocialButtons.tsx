'use client';

import { useState } from 'react';
import { SOCIAL_PROVIDERS, type SocialProvider } from '@/lib/auth/providers';
import { startSocialLogin } from '@/lib/auth/actions';

/**
 * 소셜 로그인 버튼 묶음.
 *
 * 이 컴포넌트는 네이버가 Supabase 내장이 아니라는 사실을 전혀 모른다.
 * SOCIAL_PROVIDERS를 map 하고 startSocialLogin에 넘길 뿐이다.
 * 제공자별 분기가 UI에 새어 나오지 않게 하는 게 이 구조의 목적이다.
 */
export function SocialButtons({ onError }: { onError: (message: string) => void }) {
  const [pending, setPending] = useState<string | null>(null);

  const handle = async (provider: SocialProvider) => {
    setPending(provider.id);
    try {
      await startSocialLogin(provider);
      // 성공 시 브라우저가 외부로 이동하므로 pending을 되돌리지 않는다.
      // 여기서 setPending(null)을 하면 이동 직전에 버튼이 되살아나 두 번 눌린다.
    } catch (e) {
      setPending(null);
      onError(e instanceof Error ? e.message : '로그인을 시작하지 못했습니다.');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      {SOCIAL_PROVIDERS.map((provider) => (
        <button
          key={provider.id}
          type="button"
          disabled={pending !== null}
          onClick={() => handle(provider)}
          style={{
            backgroundColor: provider.brand.bg,
            color: provider.brand.fg,
            border: provider.brand.border ? `1px solid ${provider.brand.border}` : 'none',
          }}
          className="flex h-12 w-full items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          <ProviderIcon id={provider.id} />
          <span>{pending === provider.id ? '이동 중…' : provider.label}</span>
        </button>
      ))}
    </div>
  );
}

/** 브랜드 로고. 외부 이미지 요청을 없애려고 인라인 SVG로 둔다. */
function ProviderIcon({ id }: { id: string }) {
  if (id === 'kakao') {
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
        <path
          fill="currentColor"
          d="M12 3C6.9 3 2.8 6.3 2.8 10.3c0 2.6 1.7 4.9 4.3 6.2-.2.7-.7 2.5-.8 2.9-.1.5.2.5.4.4.2-.1 2.7-1.8 3.7-2.5.5.1 1.1.1 1.6.1 5.1 0 9.2-3.3 9.2-7.3S17.1 3 12 3Z"
        />
      </svg>
    );
  }
  if (id === 'naver') {
    return (
      <svg width="15" height="15" viewBox="0 0 20 20" aria-hidden="true">
        <path fill="currentColor" d="M13.1 10.7 6.6 1H1v18h5.9V9.3l6.5 9.7H19V1h-5.9v9.7Z" />
      </svg>
    );
  }
  // Google — 공식 4색 로고. 단색으로 바꾸면 브랜드 가이드 위반이다.
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.6 30.2.5 24 .5 14.6.5 6.5 5.9 2.6 13.7l7.8 6.1C12.3 14 17.7 9.5 24 9.5Z" />
      <path fill="#4285F4" d="M46.1 24.6c0-1.6-.1-3.1-.4-4.6H24v9.1h12.4c-.5 2.9-2.2 5.3-4.7 7l7.6 5.9c4.4-4.1 6.8-10.1 6.8-17.4Z" />
      <path fill="#FBBC05" d="M10.4 28.6a14.5 14.5 0 0 1 0-9.2l-7.8-6.1a23.5 23.5 0 0 0 0 21.4l7.8-6.1Z" />
      <path fill="#34A853" d="M24 47.5c6.2 0 11.5-2 15.3-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.7 2.3-6.3 0-11.7-4.5-13.6-10.3l-7.8 6.1C6.5 42.1 14.6 47.5 24 47.5Z" />
    </svg>
  );
}

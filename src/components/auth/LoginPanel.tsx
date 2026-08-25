'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { SocialButtons } from '@/components/auth/SocialButtons';
import { EmailForm } from '@/components/auth/EmailForm';
import { describeCallbackError } from '@/lib/auth/actions';
import type { SocialProviderId } from '@/lib/auth/providers';

/**
 * 로그인 패널.
 *
 * 소셜을 위에, 이메일을 아래에 둔 이유:
 * 국내 사용자 대부분은 카카오/네이버로 로그인한다. 이메일 입력란이 위에 있으면
 * 다수가 필요 없는 폼을 먼저 읽고 지나쳐야 한다.
 * 이메일 로그인은 소셜을 원치 않는 소수를 위한 선택지이므로 아래가 맞다.
 *
 * 오류 표시를 한 곳으로 모은 이유:
 * 소셜 실패(콜백 리다이렉트로 도착)와 이메일 실패(폼 제출)는 발생 경로가 다르지만
 * 사용자에게는 같은 "로그인 실패"다. 두 자리에 나눠 띄우면
 * 화면 어디를 봐야 할지 매번 달라진다.
 */
export function LoginPanel() {
  const params = useSearchParams();
  const [error, setError] = useState('');

  // OAuth 콜백이 ?error=... 로 되돌려 보낸 실패를 읽어 표시한다.
  useEffect(() => {
    const code = params.get('error');
    if (!code) return;
    if (code === 'link_expired') {
      setError('링크가 만료되었거나 이미 사용되었습니다. 다시 시도해 주세요.');
      return;
    }
    setError(
      describeCallbackError(code, (params.get('provider') as SocialProviderId) ?? undefined),
    );
  }, [params]);

  return (
    <div className="flex flex-col gap-5">
      {error && (
        <p
          role="alert"
          className="rounded-lg bg-red-50 px-3 py-2 text-xs leading-relaxed text-red-600"
        >
          {error}
        </p>
      )}

      <SocialButtons onError={setError} />

      <div className="flex items-center gap-3">
        <span className="h-px flex-1 bg-border" />
        <span className="text-xs text-gray-400">또는 이메일로</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <EmailForm onError={setError} />
    </div>
  );
}

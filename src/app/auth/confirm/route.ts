import { NextResponse } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /auth/confirm?token_hash=...&type=magiclink&next=/
 *
 * 1회용 토큰을 세션으로 바꾼다. 두 곳에서 쓰인다:
 *   - 네이버 로그인 (우리 콜백이 발급한 토큰)
 *   - 비밀번호 재설정 메일 링크
 *
 * /auth/callback 과 나눈 이유:
 * 저쪽은 OAuth 인증 '코드'(code)를 다루고, 여기는 이메일 OTP '토큰 해시'를 다룬다.
 * Supabase의 교환 함수 자체가 다르다(exchangeCodeForSession vs verifyOtp).
 * 한 라우트에 합치면 파라미터로 분기하는 코드가 생기는데,
 * 인증 경로에서 분기는 곧 실수할 여지다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;
  const next = safeNext(url.searchParams.get('next'));

  if (!tokenHash || !type) {
    return NextResponse.redirect(new URL('/login?error=provider_error', url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });

  if (error) {
    console.error('[auth-confirm] 토큰 검증 실패', error.message);
    // 만료/재사용된 링크가 가장 흔한 원인이다.
    return NextResponse.redirect(new URL('/login?error=link_expired', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

function safeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

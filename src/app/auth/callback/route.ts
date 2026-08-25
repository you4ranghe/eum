import { NextResponse } from 'next/server';
import { createServerSupabase } from '@/lib/supabase/server';

/**
 * GET /auth/callback?code=...&next=/
 *
 * Google / Kakao OAuth와 이메일 확인 링크가 공통으로 돌아오는 지점.
 * Supabase가 준 인증 코드를 세션 쿠키로 교환한다.
 *
 * 라우트 핸들러에서 처리하는 이유:
 * 쿠키를 써야 하는데 서버 컴포넌트는 쿠키를 쓸 수 없다.
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get('code');
  const next = safeNext(url.searchParams.get('next'));

  if (!code) {
    return NextResponse.redirect(new URL('/login?error=provider_error', url.origin));
  }

  const supabase = await createServerSupabase();
  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    console.error('[auth-callback] 코드 교환 실패', error.message);
    return NextResponse.redirect(new URL('/login?error=provider_error', url.origin));
  }

  return NextResponse.redirect(new URL(next, url.origin));
}

/**
 * 오픈 리다이렉트 방어.
 *
 * next 파라미터를 검증 없이 쓰면 `?next=https://evil.example` 로
 * 우리 도메인을 거쳐 피싱 사이트로 보낼 수 있다. 로그인 직후라
 * 사용자가 가장 방심하는 순간이므로 특히 위험하다.
 * → 슬래시 하나로 시작하는 내부 경로만 허용한다.
 *   (`//evil.com`은 프로토콜 상대 URL이므로 반드시 함께 막아야 한다)
 */
function safeNext(value: string | null): string {
  if (!value) return '/';
  if (!value.startsWith('/') || value.startsWith('//')) return '/';
  return value;
}

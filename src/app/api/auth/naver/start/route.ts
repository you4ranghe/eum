import { randomBytes } from 'node:crypto';
import { NextResponse } from 'next/server';

/**
 * GET /api/auth/naver/start
 * 네이버 로그인 동의 화면으로 보낸다.
 *
 * ── state 파라미터를 쓰는 이유 (생략하면 CSRF 취약점) ──
 * 공격자가 자기 계정의 인증 코드를 담은 콜백 URL로 피해자를 유도하면,
 * 피해자 브라우저가 공격자 계정으로 로그인된다. 이후 피해자가 저장하는
 * 여행 일정이 전부 공격자 계정에 쌓인다.
 * → 시작 시 난수를 만들어 httpOnly 쿠키와 URL에 함께 싣고,
 *   콜백에서 둘이 일치하는지 확인한다. 공격자는 피해자 쿠키를 못 만든다.
 *
 * 네이버는 Supabase 내장 제공자가 아니라서 이 과정을 직접 구현해야 한다.
 * (Google/Kakao는 Supabase가 동일한 검증을 대신 해준다)
 */
export async function GET(request: Request) {
  const clientId = process.env.NAVER_LOGIN_CLIENT_ID;
  if (!clientId) {
    return NextResponse.redirect(
      new URL('/login?error=provider_error&provider=naver', request.url),
    );
  }

  const state = randomBytes(24).toString('base64url');
  const origin = new URL(request.url).origin;

  const authorize = new URL('https://nid.naver.com/oauth2.0/authorize');
  authorize.searchParams.set('response_type', 'code');
  authorize.searchParams.set('client_id', clientId);
  authorize.searchParams.set('redirect_uri', `${origin}/api/auth/naver/callback`);
  authorize.searchParams.set('state', state);

  const response = NextResponse.redirect(authorize);
  response.cookies.set('naver_oauth_state', state, {
    httpOnly: true,           // JS에서 읽을 수 없어야 의미가 있다
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',          // strict면 외부 도메인에서 돌아올 때 쿠키가 안 실린다
    path: '/',
    maxAge: 600,              // 10분. 동의 화면에 오래 머무는 경우까지만 허용
  });
  return response;
}

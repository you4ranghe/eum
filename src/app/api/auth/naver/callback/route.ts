import { NextResponse } from 'next/server';
import { createAdminSupabase } from '@/lib/supabase/server';

/**
 * ═══════════════════════════════════════════════════════════════
 * GET /api/auth/naver/callback
 *
 * 네이버는 Supabase 내장 제공자가 아니므로, 네이버 인증 결과를
 * **Supabase 세션으로 바꾸는 다리**를 우리가 놓아야 한다.
 *
 * 흐름:
 *   1. state 검증 (CSRF)
 *   2. code → 네이버 액세스 토큰
 *   3. 액세스 토큰 → 네이버 프로필(이메일)
 *   4. 이메일로 Supabase 사용자 조회/생성
 *   5. 매직링크 토큰 발급 → /auth/confirm 으로 넘겨 세션 수립
 *
 * ── 5번이 왜 이런 우회 방식인가 ──
 * Supabase에는 "이 사용자로 세션을 만들어라"는 서버 API가 없다.
 * (있으면 service_role 유출 시 아무나 사칭 가능해지므로 당연한 설계다)
 * 대신 generateLink가 1회용 토큰을 주고, verifyOtp가 그것을 세션으로 바꾼다.
 * 이게 공식적으로 지원되는 유일한 경로다.
 *
 * ── service_role 사용에 대하여 ──
 * CLAUDE.md 규칙 5는 "service_role은 공용 캐시 테이블 쓰기에만"이다.
 * 여기는 그 규칙의 **문서화된 예외**다. 사용자 생성과 토큰 발급은
 * 관리자 권한 없이는 불가능하다. 대신 다음을 지킨다:
 *   - 이 파일 밖으로 admin 클라이언트를 내보내지 않는다
 *   - 네이버가 검증한 이메일 외의 어떤 입력도 신뢰하지 않는다
 *   - 실패 시 항상 /login으로만 되돌린다 (오류 세부는 서버 로그에만)
 * ═══════════════════════════════════════════════════════════════
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const origin = url.origin;
  const fail = (code: string) =>
    NextResponse.redirect(new URL(`/login?error=${code}&provider=naver`, origin));

  // 사용자가 동의 화면에서 취소한 경우
  if (url.searchParams.get('error')) return fail('access_denied');

  const code = url.searchParams.get('code');
  const state = url.searchParams.get('state');
  const cookieState = request.headers
    .get('cookie')
    ?.split('; ')
    .find((c) => c.startsWith('naver_oauth_state='))
    ?.split('=')[1];

  if (!code || !state || !cookieState || state !== cookieState) {
    return fail('state_mismatch');
  }

  const clientId = process.env.NAVER_LOGIN_CLIENT_ID;
  const clientSecret = process.env.NAVER_LOGIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) return fail('provider_error');

  try {
    // ── 2. 인증 코드를 액세스 토큰으로 교환 ──
    const tokenUrl = new URL('https://nid.naver.com/oauth2.0/token');
    tokenUrl.searchParams.set('grant_type', 'authorization_code');
    tokenUrl.searchParams.set('client_id', clientId);
    tokenUrl.searchParams.set('client_secret', clientSecret);
    tokenUrl.searchParams.set('code', code);
    tokenUrl.searchParams.set('state', state);

    const tokenRes = await fetch(tokenUrl, { cache: 'no-store' });
    const tokenJson = await tokenRes.json();
    // 네이버는 실패해도 HTTP 200을 주고 본문에 error를 담는다. res.ok로는 못 잡는다.
    if (!tokenJson.access_token) return fail('provider_error');

    // ── 3. 프로필 조회 ──
    const meRes = await fetch('https://openapi.naver.com/v1/nid/me', {
      headers: { Authorization: `Bearer ${tokenJson.access_token}` },
      cache: 'no-store',
    });
    const meJson = await meRes.json();
    const profile = meJson?.response as
      | { id: string; email?: string; name?: string; nickname?: string; profile_image?: string }
      | undefined;

    if (!profile?.id) return fail('provider_error');

    // 이메일은 사용자가 제공을 거부할 수 있다. 우리 DB는 이메일을 식별자로 쓰므로
    // 없으면 진행할 수 없다. 조용히 실패시키지 말고 이유를 알려준다.
    if (!profile.email) return fail('no_email');

    // ── 4~5. Supabase 사용자 확보 후 세션 토큰 발급 ──
    const admin = createAdminSupabase();
    const identity = {
      provider: 'naver',
      naver_id: profile.id,
      name: profile.name ?? profile.nickname ?? null,
      avatar_url: profile.profile_image ?? null,
    };

    // generateLink는 사용자가 없으면 만들고, 있으면 그대로 쓴다.
    // 별도의 "존재 확인 → 분기" 코드가 필요 없어 경합 상황에도 안전하다.
    let { data, error } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: profile.email,
    });

    if (error?.message?.match(/not found|no user/i)) {
      const created = await admin.auth.admin.generateLink({
        type: 'signup',
        email: profile.email,
        // 소셜 로그인 사용자는 비밀번호를 쓰지 않는다.
        // 그래도 계정 자체는 비밀번호 재설정으로 되찾을 수 있어야 하므로
        // 추측 불가능한 난수를 넣어둔다.
        password: crypto.randomUUID() + crypto.randomUUID(),
        options: { data: identity },
      });
      data = created.data;
      error = created.error;
    }

    if (error || !data?.properties?.hashed_token) {
      console.error('[naver-oauth] generateLink 실패', error?.message);
      return fail('provider_error');
    }

    // 세션 수립은 브라우저에서 일어나야 한다(쿠키를 심어야 하므로).
    // 토큰을 /auth/confirm 으로 넘긴다.
    const confirm = new URL('/auth/confirm', origin);
    confirm.searchParams.set('token_hash', data.properties.hashed_token);
    confirm.searchParams.set('type', 'magiclink');
    confirm.searchParams.set('next', '/');

    const response = NextResponse.redirect(confirm);
    response.cookies.delete('naver_oauth_state'); // 1회용. 재사용 방지
    return response;
  } catch (e) {
    console.error('[naver-oauth] 예외', e);
    return fail('provider_error');
  }
}

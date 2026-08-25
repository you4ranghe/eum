import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * ─────────────────────────────────────────────────────────────
 * 세션 갱신 미들웨어.
 *
 * ── 왜 미들웨어가 반드시 필요한가 ──
 * Supabase의 액세스 토큰은 1시간짜리다. 갱신하려면 새 쿠키를 써야 하는데,
 * **서버 컴포넌트는 쿠키를 쓸 수 없다**(Next.js 제약).
 * 미들웨어는 요청/응답 사이에 있어 쿠키를 쓸 수 있는 유일한 지점이다.
 * 이게 없으면 사용자는 한 시간마다 조용히 로그아웃된다.
 *
 * ── 이 코드에서 절대 건드리면 안 되는 것 ──
 * 1. `supabaseResponse` 객체를 그대로 반환해야 한다.
 *    새 NextResponse를 만들어 반환하면 갱신된 쿠키가 유실되고,
 *    "로그인은 되는데 새로고침하면 풀리는" 재현 어려운 버그가 된다.
 * 2. createServerClient와 getUser() 사이에 다른 코드를 넣지 않는다.
 *    사이에서 리다이렉트하면 토큰 갱신이 중간에 끊긴다.
 *
 * ── getSession()이 아니라 getUser()를 쓰는 이유 ──
 * getSession()은 쿠키를 그대로 신뢰한다. 쿠키는 클라이언트가 보내는 값이므로
 * 위조 가능하다. getUser()는 Supabase 서버에 검증을 요청한다.
 * 서버 측 인가 판단에는 반드시 getUser()를 써야 한다.
 * ─────────────────────────────────────────────────────────────
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  // Supabase 미설정 상태(개발 초기)에서도 앱이 죽지 않아야 한다.
  // 목 데이터로 화면을 확인하는 흐름을 막지 않기 위한 방어.
  if (!url || !anonKey) return supabaseResponse;

  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (cookiesToSet) => {
        cookiesToSet.forEach(({ name, value }) =>
          request.cookies.set(name, value),
        );
        supabaseResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) =>
          supabaseResponse.cookies.set(name, value, options),
        );
      },
    },
  });

  // 이 호출이 토큰 갱신을 트리거한다. 결과를 안 쓰더라도 반드시 호출해야 한다.
  await supabase.auth.getUser();

  return supabaseResponse;
}

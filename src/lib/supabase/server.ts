import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';
import { createClient as createRawClient } from '@supabase/supabase-js';

/**
 * Route Handler / 서버 컴포넌트용 클라이언트.
 * 쿠키에서 세션을 읽어 auth.uid()가 채워지므로 RLS가 그대로 적용된다.
 */
export async function createServerSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (list) => {
          try {
            list.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // 서버 컴포넌트에서는 쿠키 쓰기가 막혀 있다.
            // 세션 갱신은 미들웨어가 담당하므로 여기서는 무시해도 안전하다.
          }
        },
      },
    },
  );
}

/**
 * RLS를 우회하는 관리자 클라이언트.
 *
 * 용도를 딱 하나로 제한한다: 외부 API에서 가져온 장소/경로를 공용 캐시 테이블에 쓰기.
 * 사용자 데이터에는 절대 쓰지 않는다 — 그 순간 RLS가 무의미해지고,
 * 권한 버그가 DB가 아니라 코드 리뷰에서만 잡히는 상태가 된다.
 */
export function createAdminSupabase() {
  return createRawClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

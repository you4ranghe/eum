'use client';

import { createBrowserClient } from '@supabase/ssr';

/**
 * 브라우저용 Supabase 클라이언트.
 *
 * anon 키를 클라이언트에 노출해도 되는 이유는 RLS 때문이다.
 * 이 키는 "인증된 사용자로서 요청할 수 있는 권한"만 주고,
 * 어떤 행을 읽고 쓸 수 있는지는 전적으로 DB 정책이 결정한다.
 * → 서버 왕복 없이 클라이언트가 직접 CRUD 할 수 있어
 *   Vercel Function 호출 수(무료 티어의 실질적 병목)를 크게 아낀다.
 */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  );
}

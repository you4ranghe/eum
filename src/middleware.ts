import type { NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

export async function middleware(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  /**
   * 미들웨어는 모든 요청에서 실행되므로 제외 목록이 곧 성능이다.
   * 정적 파일과 이미지는 세션이 필요 없으니 빼서, 무료 티어의
   * 미들웨어 호출 수를 낭비하지 않는다.
   *
   * 주의: /api/auth/* 는 제외하지 않는다.
   * OAuth 콜백에서 세션 쿠키를 심어야 하기 때문이다.
   */
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)',
  ],
};

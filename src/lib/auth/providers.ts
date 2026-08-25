/**
 * ═══════════════════════════════════════════════════════════════
 * 소셜 로그인 제공자 정의.
 *
 * ── 왜 추상화가 필요한가 ──
 * 4가지 로그인 중 3가지는 Supabase가 대신 처리해 주지만,
 * **네이버는 Supabase 내장 제공자 목록에 없다.**
 * (내장: apple, azure, discord, facebook, github, google, kakao, ... naver 없음)
 *
 * 즉 흐름이 두 갈래다:
 *   Google / Kakao → supabase.auth.signInWithOAuth()  — 한 줄
 *   Naver          → 우리가 OAuth 코드 플로우를 직접 구현
 *
 * 이 차이를 UI가 알게 되면 로그인 화면이 if 문 덩어리가 된다.
 * → 제공자를 데이터로 기술하고, 분기는 startSocialLogin() 안에만 둔다.
 *   버튼 컴포넌트는 이 배열을 map 할 뿐이다.
 *   나중에 애플 로그인을 붙여도 이 파일에 객체 하나만 추가하면 된다.
 * ═══════════════════════════════════════════════════════════════
 */

export type SocialProviderId = 'google' | 'kakao' | 'naver';

export interface SocialProvider {
  id: SocialProviderId;
  label: string;
  /**
   * supabase — Supabase 내장 OAuth를 그대로 사용.
   *            클라이언트 시크릿은 Supabase 대시보드에 넣으므로 우리 .env에 없다.
   * custom   — 우리 Route Handler가 OAuth 전 과정을 처리.
   *            시크릿이 우리 서버 환경변수로 들어온다.
   */
  kind: 'supabase' | 'custom';
  /** custom 제공자의 로그인 시작 경로 */
  startPath?: string;
  /** 브랜드 가이드라인상 고정된 색. 임의로 바꾸면 심사에서 반려될 수 있다. */
  brand: {
    bg: string;
    fg: string;
    /** 흰 배경 버튼은 테두리가 없으면 배경에 묻힌다 */
    border?: string;
  };
}

export const SOCIAL_PROVIDERS: SocialProvider[] = [
  {
    id: 'kakao',
    label: '카카오로 시작하기',
    kind: 'supabase',
    // 카카오 브랜드 가이드: 배경 #FEE500, 글자는 85% 불투명 검정
    brand: { bg: '#FEE500', fg: 'rgba(0,0,0,0.85)' },
  },
  {
    id: 'naver',
    label: '네이버로 시작하기',
    kind: 'custom',
    startPath: '/api/auth/naver/start',
    // 네이버 브랜드 가이드: 배경 #03C75A, 글자 흰색
    brand: { bg: '#03C75A', fg: '#ffffff' },
  },
  {
    id: 'google',
    label: 'Google로 시작하기',
    kind: 'supabase',
    // 구글 브랜드 가이드: 흰 배경 + #747775 테두리
    brand: { bg: '#ffffff', fg: '#1f1f1f', border: '#747775' },
  },
];

/**
 * OAuth 콜백이 돌아올 절대 URL을 만든다.
 *
 * window.location.origin을 쓰지 않고 환경변수를 우선하는 이유:
 * Vercel 프리뷰 배포는 매번 URL이 달라진다. origin을 그대로 쓰면
 * 각 프리뷰 URL을 전부 OAuth 콘솔에 등록해야 하는데 현실적으로 불가능하다.
 * → 프로덕션 URL을 고정해두고, 로컬에서만 origin으로 폴백한다.
 */
export function getRedirectUrl(path: string): string {
  const base =
    process.env.NEXT_PUBLIC_SITE_URL ??
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');
  return new URL(path, base).toString();
}

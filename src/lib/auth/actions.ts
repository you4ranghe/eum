'use client';

import { createClient } from '@/lib/supabase/client';
import {
  getRedirectUrl,
  type SocialProvider,
  type SocialProviderId,
} from '@/lib/auth/providers';

/**
 * 로그인/로그아웃 동작.
 *
 * 오류 메시지를 한국어로 변환해서 던지는 이유:
 * Supabase는 "Invalid login credentials" 같은 영어 메시지를 준다.
 * 이걸 그대로 노출하면 사용자는 무엇을 고쳐야 할지 모른다.
 * 변환 지점을 여기 한 곳으로 모아, 컴포넌트마다 메시지를 재작성하지 않게 한다.
 */

export class AuthError extends Error {}

/** Google / Kakao / Naver — 분기는 여기에만 존재한다. */
export async function startSocialLogin(provider: SocialProvider): Promise<void> {
  if (provider.kind === 'custom') {
    // 네이버: 우리 서버가 OAuth를 처리한다. 전체 페이지 이동이어야 한다
    // (fetch로 하면 리다이렉트를 따라가면서 쿠키가 제대로 안 심긴다)
    window.location.href = provider.startPath!;
    return;
  }

  const supabase = createClient();
  const { error } = await supabase.auth.signInWithOAuth({
    provider: provider.id as 'google' | 'kakao',
    options: {
      redirectTo: getRedirectUrl('/auth/callback'),
      // 카카오는 기본으로 이메일을 안 줄 수 있다. 동의 항목에서 이메일을
      // '필수'로 설정해야 하며, 그래도 거부 가능하므로 콜백에서 방어한다.
    },
  });
  if (error) throw new AuthError(translate(error.message));
}

export async function signUpWithEmail(email: string, password: string): Promise<'confirm' | 'done'> {
  const supabase = createClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: getRedirectUrl('/auth/callback') },
  });
  if (error) throw new AuthError(translate(error.message));

  // 이메일 확인이 켜져 있으면 session이 null로 온다.
  // 이 둘을 구분하지 않으면 "가입했는데 로그인이 안 되는" 것처럼 보인다.
  return data.session ? 'done' : 'confirm';
}

export async function signInWithEmail(email: string, password: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw new AuthError(translate(error.message));
}

export async function sendPasswordReset(email: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: getRedirectUrl('/auth/callback?next=/account/password'),
  });
  if (error) throw new AuthError(translate(error.message));
}

export async function updatePassword(password: string): Promise<void> {
  const supabase = createClient();
  const { error } = await supabase.auth.updateUser({ password });
  if (error) throw new AuthError(translate(error.message));
}

export async function signOut(): Promise<void> {
  const supabase = createClient();
  await supabase.auth.signOut();
  // 서버 컴포넌트 캐시를 비우기 위해 full reload를 한다.
  // router.refresh()만으로는 미들웨어가 만든 쿠키 상태가 남을 수 있다.
  window.location.href = '/';
}

/** 소셜 제공자별 실패 안내. 각 콘솔 설정 실수를 사용자 언어로 옮긴다. */
export function describeCallbackError(
  code: string | null,
  providerId?: SocialProviderId,
): string {
  switch (code) {
    case 'no_email':
      return `${providerId ?? '소셜'} 계정에서 이메일을 받지 못했습니다. 이메일 제공에 동의하거나 다른 방법으로 로그인해 주세요.`;
    case 'state_mismatch':
      return '보안 검증에 실패했습니다. 로그인을 처음부터 다시 시도해 주세요.';
    case 'access_denied':
      return '로그인이 취소되었습니다.';
    case 'provider_error':
      return '소셜 로그인 제공자와 통신하지 못했습니다. 잠시 후 다시 시도해 주세요.';
    default:
      return '로그인에 실패했습니다. 다시 시도해 주세요.';
  }
}

const MESSAGES: Array<[RegExp, string]> = [
  [/invalid login credentials/i, '이메일 또는 비밀번호가 올바르지 않습니다.'],
  [/email not confirmed/i, '이메일 인증이 완료되지 않았습니다. 받은 메일함을 확인해 주세요.'],
  [/user already registered/i, '이미 가입된 이메일입니다. 로그인해 주세요.'],
  [/password should be at least/i, '비밀번호는 8자 이상이어야 합니다.'],
  [/for security purposes|rate limit|too many requests/i, '요청이 너무 잦습니다. 잠시 후 다시 시도해 주세요.'],
  [/unable to validate email/i, '이메일 형식이 올바르지 않습니다.'],
  [/new password should be different/i, '기존 비밀번호와 다른 비밀번호를 입력해 주세요.'],
];

function translate(message: string): string {
  for (const [pattern, korean] of MESSAGES) {
    if (pattern.test(message)) return korean;
  }
  return message;
}

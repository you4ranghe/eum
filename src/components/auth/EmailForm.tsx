'use client';

import { useState } from 'react';
import clsx from 'clsx';
import {
  sendPasswordReset,
  signInWithEmail,
  signUpWithEmail,
} from '@/lib/auth/actions';

type Mode = 'signin' | 'signup' | 'reset';

/**
 * 이메일 로그인 / 가입 / 비밀번호 재설정.
 *
 * 세 화면을 라우트로 나누지 않고 한 컴포넌트의 모드로 둔 이유:
 * 사용자는 이 셋 사이를 자주 오간다("어? 가입 안 했나?", "비밀번호 뭐였지").
 * 페이지를 이동시키면 입력한 이메일이 날아가고, 매번 다시 타이핑하게 된다.
 * 모드 전환이면 email 상태가 유지되므로 왕복 비용이 사라진다.
 * 화면 3개를 만들지 않아 유지보수 비용도 줄어든다.
 */
export function EmailForm({ onError }: { onError: (message: string) => void }) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setNotice(null);
    onError('');

    try {
      if (mode === 'reset') {
        await sendPasswordReset(email);
        setNotice('비밀번호 재설정 링크를 보냈습니다. 메일함을 확인해 주세요.');
      } else if (mode === 'signup') {
        const result = await signUpWithEmail(email, password);
        if (result === 'confirm') {
          setNotice('인증 메일을 보냈습니다. 메일의 링크를 눌러 가입을 완료해 주세요.');
        } else {
          window.location.href = '/';
        }
      } else {
        await signInWithEmail(email, password);
        window.location.href = '/';
      }
    } catch (err) {
      onError(err instanceof Error ? err.message : '처리에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  const labels = {
    signin: { submit: '로그인', busy: '로그인 중…' },
    signup: { submit: '가입하기', busy: '가입 중…' },
    reset: { submit: '재설정 링크 받기', busy: '전송 중…' },
  }[mode];

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1">
        <span className="text-xs font-medium text-gray-600">이메일</span>
        <input
          type="email"
          required
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="you@example.com"
          className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
        />
      </label>

      {mode !== 'reset' && (
        <label className="flex flex-col gap-1">
          <span className="text-xs font-medium text-gray-600">비밀번호</span>
          <input
            type="password"
            required
            minLength={8}
            // 브라우저 비밀번호 관리자가 저장/자동완성을 제대로 하려면
            // 가입과 로그인의 autoComplete 값이 달라야 한다.
            autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="8자 이상"
            className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
          />
        </label>
      )}

      {notice && (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-xs text-emerald-700">{notice}</p>
      )}

      <button
        type="submit"
        disabled={busy}
        className={clsx(
          'h-12 rounded-lg bg-brand text-sm font-semibold text-white transition-opacity',
          'hover:opacity-90 disabled:opacity-50',
        )}
      >
        {busy ? labels.busy : labels.submit}
      </button>

      <div className="flex items-center justify-between text-xs text-gray-500">
        {mode === 'signin' ? (
          <>
            <button type="button" onClick={() => setMode('signup')} className="hover:text-brand">
              이메일로 가입하기
            </button>
            <button type="button" onClick={() => setMode('reset')} className="hover:text-brand">
              비밀번호를 잊으셨나요?
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setMode('signin')} className="hover:text-brand">
            ← 로그인으로 돌아가기
          </button>
        )}
      </div>
    </form>
  );
}

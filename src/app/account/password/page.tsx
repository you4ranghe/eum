'use client';

import { useState } from 'react';
import { updatePassword } from '@/lib/auth/actions';

/**
 * 비밀번호 변경 화면.
 *
 * 재설정 메일의 링크는 /auth/confirm 을 거쳐 여기로 온다.
 * 그 시점에는 **이미 로그인된 상태**다 — Supabase의 재설정 흐름은
 * "임시 세션을 만들어 준 뒤 비밀번호를 바꾸게" 하는 방식이기 때문이다.
 * 그래서 이 화면은 기존 비밀번호를 묻지 않는다(물을 수도 없다).
 *
 * 로그인 상태에서 직접 들어와 변경하는 경로로도 그대로 쓰인다.
 */
export default function PasswordPage() {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) {
      setError('두 비밀번호가 일치하지 않습니다.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updatePassword(password);
      setDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '변경에 실패했습니다.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-surface p-6 shadow-sm">
        <h1 className="text-lg font-bold">비밀번호 변경</h1>

        {done ? (
          <div className="mt-4">
            <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              비밀번호가 변경되었습니다.
            </p>
            <a
              href="/"
              className="mt-4 flex h-12 items-center justify-center rounded-lg bg-brand text-sm font-semibold text-white"
            >
              일정으로 돌아가기
            </a>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 flex flex-col gap-3">
            {error && (
              <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-xs text-red-600">
                {error}
              </p>
            )}
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">새 비밀번호</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="8자 이상"
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
              />
            </label>
            <label className="flex flex-col gap-1">
              <span className="text-xs font-medium text-gray-600">새 비밀번호 확인</span>
              <input
                type="password"
                required
                minLength={8}
                autoComplete="new-password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="h-11 rounded-lg border border-border px-3 text-sm outline-none focus:border-brand focus:ring-2 focus:ring-brand-soft"
              />
            </label>
            <button
              type="submit"
              disabled={busy}
              className="h-12 rounded-lg bg-brand text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
            >
              {busy ? '변경 중…' : '변경하기'}
            </button>
          </form>
        )}
      </div>
    </main>
  );
}

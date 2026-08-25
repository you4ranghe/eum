import { Suspense } from 'react';
import Link from 'next/link';
import { LoginPanel } from '@/components/auth/LoginPanel';

export const metadata = {
  title: '로그인 — 이음',
};

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-surface-muted p-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <Link href="/" className="text-2xl font-bold tracking-tight">
            이음
          </Link>
          <p className="mt-1 text-sm text-gray-500">
            로그인하면 일정이 저장되고 어느 기기에서나 이어서 볼 수 있습니다.
          </p>
        </div>

        <div className="rounded-2xl border border-border bg-surface p-6 shadow-sm">
          {/* useSearchParams를 쓰는 자식은 Suspense로 감싸야 한다.
              없으면 빌드 시 이 페이지 전체가 정적 생성에서 빠진다. */}
          <Suspense fallback={<div className="h-80" />}>
            <LoginPanel />
          </Suspense>
        </div>

        <p className="mt-4 text-center text-xs text-gray-400">
          <Link href="/" className="hover:text-gray-600">
            로그인 없이 둘러보기 →
          </Link>
        </p>
      </div>
    </main>
  );
}

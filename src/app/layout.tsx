import type { Metadata, Viewport } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: '이음 — 여행 동선 플래너',
  description: '날짜별 일정과 이동 동선을 지도 위에서 설계하는 여행 플래너',
};

// 지도는 100vh를 채워야 하므로 확대/스크롤 바운스를 제어한다.
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="h-full overflow-hidden">{children}</body>
    </html>
  );
}

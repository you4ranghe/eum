import { AppShell } from '@/components/layout/AppShell';

/**
 * 루트 페이지는 서버 컴포넌트로 유지하고, 지도/사이드바만 클라이언트로 내려보낸다.
 * → 지도 SDK는 필연적으로 클라이언트 전용이지만,
 *   나중에 여행 목록/공유 페이지를 서버에서 데이터 패칭할 여지를 남긴다.
 */
export default function HomePage() {
  return <AppShell />;
}

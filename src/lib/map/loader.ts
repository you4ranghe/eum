/**
 * 외부 지도 SDK 스크립트 로더.
 *
 * 제공자 탭을 왔다갔다 하면 같은 스크립트를 반복 삽입하게 되는데,
 * SDK들은 대부분 전역(window.naver / window.google)에 자신을 등록하므로
 * 중복 로드는 낭비이자 예측 불가 동작의 원인이다.
 * → src를 키로 Promise를 캐싱해 "정확히 한 번만" 로드되도록 보장한다.
 */
const cache = new Map<string, Promise<void>>();

export function loadScript(src: string): Promise<void> {
  const existing = cache.get(src);
  if (existing) return existing;

  const promise = new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = src;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      cache.delete(src); // 실패한 Promise를 캐시에 남기면 영원히 재시도 불가
      reject(new Error(`지도 SDK 로드 실패: ${src}`));
    };
    document.head.appendChild(el);
  });

  cache.set(src, promise);
  return promise;
}

/**
 * Google Maps는 script onload 이후에도 라이브러리 초기화가 끝나지 않을 수 있어
 * 특정 전역이 준비될 때까지 폴링하는 헬퍼를 함께 둔다.
 */
export function waitForGlobal(
  check: () => boolean,
  timeoutMs = 10_000,
): Promise<void> {
  return new Promise((resolve, reject) => {
    if (check()) return resolve();
    const started = Date.now();
    const timer = setInterval(() => {
      if (check()) {
        clearInterval(timer);
        resolve();
      } else if (Date.now() - started > timeoutMs) {
        clearInterval(timer);
        reject(new Error('지도 SDK 초기화 타임아웃'));
      }
    }, 50);
  });
}

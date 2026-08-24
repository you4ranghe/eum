# 이음 (Eum) — 여행 동선 플래너

날짜별 이동 경로를 짜고 동선을 최적화하는 여행 일정 관리 앱.
제주도를 첫 타겟으로 하되, 지역 확장이 **코드 수정이 아닌 데이터 추가**로 이뤄지도록 설계했다.

---

## 1. 기술 스택 (Java 17 불가 → Supabase + Vercel 무료 티어)

| 레이어 | 선택 | 이유 |
|---|---|---|
| 프론트엔드 | Next.js 16 (App Router) | Vercel 무료 배포의 1급 시민 |
| API | Next.js Route Handlers | 외부 API 키가 필요한 작업만. 별도 서버 없음 |
| DB / 인증 | Supabase (Postgres + RLS + Auth) | 무료 티어에서 DB·인증·스케줄러를 한 번에 |
| 지도 렌더링 | Naver Map / Google Maps (탭 전환) | 어댑터 패턴으로 교체 가능 |
| 상태 관리 | Zustand | 지도라는 비-React 세계와 붙일 때 Context보다 단순 |

> **Spring Boot를 뺀 이유:** Spring Boot 3.x는 Java 17 이상을 요구한다.
> 로컬이 JDK 11이고 업그레이드가 불가하므로, JPA/Hibernate가 하던 역할
> (스키마·제약·권한·트랜잭션)을 **Postgres 자체와 RLS**로 옮겼다.
> 오히려 권한 검사가 애플리케이션 코드가 아니라 DB에 있게 되어 더 안전하다.

---

## 2. 디렉토리 구조

```
Eum/
├─ src/
│  ├─ app/
│  │  ├─ layout.tsx, page.tsx, globals.css
│  │  └─ api/                         ← 외부 API 키가 필요한 것만 서버 경유
│  │     ├─ places/search/route.ts    ← 네이버/구글 장소 검색 프록시 + 정규화
│  │     ├─ routes/calculate/route.ts ← 구간별 거리·시간·폴리라인 (+ DB 캐시)
│  │     └─ routes/optimize/route.ts  ← 방문 순서 최적화 (지점 많을 때만)
│  │
│  ├─ components/
│  │  ├─ layout/AppShell.tsx          ← [사이드바 | 지도] 2분할 레이아웃
│  │  ├─ map/MapCanvas.tsx            ← 지도 렌더링의 유일한 경계점
│  │  ├─ map/MapProviderTabs.tsx      ← 네이버 ↔ 구글 전환 탭
│  │  ├─ sidebar/{Sidebar,SearchPanel,ItineraryPanel,DayTabs,StopRow,PlaceCard,RegionSelect}.tsx
│  │  ├─ place/PlaceDetailModal.tsx   ← 상세 + 네이버/구글 원문 링크
│  │  └─ common/OpenBadge.tsx         ← 영업 상태 배지
│  │
│  ├─ lib/
│  │  ├─ domain/types.ts              ← 지도 SDK에 종속되지 않는 순수 도메인 모델
│  │  ├─ geo/regions.ts               ← 지역 설정(중심/줌/타임존) = 확장 지점
│  │  ├─ map/
│  │  │  ├─ types.ts                  ← MapAdapter 인터페이스 ★
│  │  │  ├─ registry.ts               ← 제공자 팩토리 + 지역별 가용성 판정
│  │  │  ├─ loader.ts                 ← SDK 스크립트 중복 로드 방지
│  │  │  └─ providers/{NaverMapAdapter,GoogleMapAdapter}.ts
│  │  ├─ providers/                   ← 서버 측 데이터 API (검색/경로)
│  │  ├─ routing/{geo,optimize}.ts    ← 거리 추정 + TSP 근사(NN + 2-opt)
│  │  ├─ time/openingHours.ts         ← 영업 중 / 마감 임박 판정
│  │  ├─ alarm/useTripAlarms.ts       ← 일정 기반 알람
│  │  ├─ supabase/{client,server,mappers}.ts
│  │  └─ api/{client,places,trips}.ts
│  │
│  └─ store/{useMapStore,useTripStore}.ts
│
└─ supabase/migrations/{0001_init,0002_functions}.sql
```

---

## 3. 핵심 설계 결정

### (1) 지도 제공자 추상화 — `MapAdapter`

Naver와 Google은 좌표 클래스, 마커 생성, 이벤트 바인딩이 전부 다르다.
UI가 이 차이를 알면 제공자를 추가할 때마다 컴포넌트를 전부 고쳐야 한다.

```
컴포넌트 ──→ MapAdapter (인터페이스)
                 ├── NaverMapAdapter   (naver.maps.* 를 여기에 가둠)
                 └── GoogleMapAdapter  (google.maps.* 를 여기에 가둠)
```

- **명령형 메서드로 설계한 이유**: 지도 SDK는 자체 DOM을 관리하는 비-React 세계다.
  선언형으로 감싸려면 diffing을 직접 구현해야 한다.
  "React가 상태를 갖고 → 어댑터에 명령한다"는 단방향이 훨씬 단순하다.
- **어댑터 인스턴스는 스토어가 아니라 `useRef`에**: 어댑터는 렌더 결과가 아니라
  부수효과 핸들이다. state에 두면 StrictMode 이중 마운트에서 인스턴스가 중복 생성된다.
- **지역이 제공자를 제약한다**: 네이버 지도는 국내만 커버한다.
  `getAvailableProviders(regionCode)`가 비활성 사유까지 함께 돌려주고,
  스토어가 `resolveProviderForRegion()`으로 잘못된 조합을 원천 차단한다.
  탭에서 숨기지 않고 **비활성 + 사유 표시**로 둔 것은, 사라지는 UI가 버그처럼 보이기 때문.

### (2) 날짜 탭 ↔ 지도 연동

탭이 지도를 직접 조작하지 않는다. 양쪽 모두 `selectedDayId` 스토어만 본다.

```
DayTabs ──(selectDay)──→ useTripStore ──(구독)──→ MapCanvas
                                                    ├─ renderMarkers(해당 날짜 stops)
                                                    ├─ renderPolylines(해당 날짜 legs)
                                                    └─ fitBounds(전체가 보이게)
```

직접 조작하면 "탭 → 지도" 단방향 의존이 생겨,
나중에 **마커 클릭 → 탭 전환**이라는 역방향을 넣을 때 순환 참조가 된다.

### (3) 동선 최적화 — Nearest Neighbor + 2-opt

TSP는 정확해가 지수 시간이라 근사한다.

- **비용 행렬은 직선거리 추정**(`haversine × 우회계수`)으로 만든다.
  N개 지점의 N²쌍을 전부 Directions API로 부르면 10곳만 돼도 90콜이다.
  → 순서 탐색은 근사값으로, **확정된 순서의 N−1개 구간만** 실제 API 호출.
  API 콜이 **O(N²) → O(N)**으로 떨어진다.
- **양 끝 고정 지원**: 실제 여행은 "숙소 출발 → 숙소 복귀"다.
  고정하지 않으면 알고리즘이 숙소를 한가운데로 옮긴다.
- 지점 12개 이하면 **브라우저에서 직접 실행**한다. 순수 함수라 서버가 필요 없고,
  Vercel 함수 호출 수를 아낀다.

### (4) 영업 상태는 클라이언트에서 파생

서버가 내려주면 1분 만에 캐시가 낡는다. 서버는 **영업시간 규칙**만 주고,
"지금 열려 있나"는 화면에서 계산한다.
타임존은 브라우저 로컬이 아니라 **장소의 타임존**을 쓴다 —
서울에서 오사카 일정을 짜는 순간 로컬 시간은 오답이 되기 때문.

### (5) 장소 상세 — iframe을 쓰지 않은 이유

네이버·구글 지도 상세는 `X-Frame-Options` / CSP로 외부 임베드를 차단한다.
iframe을 넣으면 개발 중엔 빈 화면, 운영에선 조용한 실패가 된다.
크롤링 재구성도 약관 위반 소지가 크다.

→ **모달에는 우리가 가진 정보를, 원문은 새 탭으로.**
사용자는 앱을 떠나지 않고 판단하고, 리뷰·사진이 필요할 때만 원문으로 간다.

### (6) 알람 — 왜 setTimeout이 아닌가

모바일 브라우저는 백그라운드에서 타이머를 스로틀/정지한다.
개별 타이머로는 "복귀 시점에 놓친 알람"을 감지할 수 없다.

→ **1분 tick + 지나간 알람 스윕** 구조. `visibilitychange`에서 즉시 재계산해
밀린 알람을 회수하고, 30분 넘게 지난 건은 소음이므로 조용히 소거한다.

브라우저가 **완전히 닫힌 상태**의 알림은 이 구조로 불가능하다 →
아래 무료 티어 전략의 pg_cron 경로를 쓴다.

---

## 4. 데이터 모델

```
auth.users ─1:N─ trip ─1:N─ trip_day ─1:N─ trip_stop ─N:1─ place
                                                              ↑
                                                     전역 캐시(공유)
```

- **place를 전역 캐시로 분리**: 같은 성산일출봉을 1000명이 담아도 한 행이면 된다.
  외부 API 호출과 저장 용량(무료 500MB)을 동시에 아낀다.
- **권한은 RLS로**: anon 키가 브라우저에 노출되는 구조이므로 DB가 최후의 방어선이어야 한다.
  `trip_day`/`trip_stop`은 EXISTS 서브쿼리로 부모 여행의 소유권을 따라간다.
- **`sort_order` 유니크 제약은 `deferrable`**: 즉시 검사하면 1↔2 스왑조차
  임시값 우회가 필요해진다. 커밋 시점 검사로 트랜잭션 안에서 자유롭게 재배열한다.
- **`route_leg_cache`**: Directions는 호출당 과금이다. 좌표쌍+이동수단 해시로 캐시하되,
  좌표를 소수점 5자리(약 1m)로 반올림한다 — 안 하면 부동소수점 끝자리 차이로 캐시가 안 맞는다.

---

## 5. 무료 티어에서 살아남는 전략

무료 티어의 실질 병목은 **함수 실행 시간이 아니라 호출 수와 외부 API 쿼터**다.

| 병목 | 대응 |
|---|---|
| Vercel 함수 호출 수 | 여행 CRUD는 Route Handler 없이 **Supabase 직행** (RLS가 이미 권한을 강제하므로 래퍼가 무의미). 서버를 거치는 건 "비밀 키가 필요한가?" 하나만 기준으로 판단 |
| Directions API 쿼터 | ① `route_leg_cache` DB 캐시 ② 제공자 폴백(네이버→구글→직선추정) ③ **자동 계산 안 함** — 편집 중엔 점선, 사용자가 "동선 계산"을 누를 때만 호출 |
| 장소 검색 쿼터 | Route Handler에 `revalidate = 300` — 동일 검색어를 CDN이 흡수 |
| TSP 계산 | 12곳 이하는 브라우저에서 (함수 호출 0회) |
| **분 단위 알람** | Vercel Hobby Cron은 **하루 1회**만 실행돼 "출발 10분 전"이 불가능. → **Supabase pg_cron(무료 포함)이 1분마다** 미발송 알람을 Edge Function으로 넘겨 Web Push 발송 |

### 알아둘 무료 티어 제약

- **Vercel Hobby**: 상업적 사용 불가. Cron 하루 1회.
- **Supabase Free**: DB 500MB, 7일간 활동이 없으면 **프로젝트 일시정지**(대시보드에서 복구).
  프로젝트 2개까지.
- **지도 API는 별도 과금**: Vercel/Supabase 무료와 무관하다.
  Google Maps는 월 $200 크레딧, 네이버 클라우드는 서비스별 무료 한도가 있으니
  콘솔에서 **일일 쿼터 상한**을 반드시 걸어둘 것.

---

## 6. 실행 방법

```bash
npm install
cp .env.local.example .env.local   # 키 입력
npm run dev                        # http://localhost:3000
```

`.env.local` 없이도 **목 데이터로 화면 전체 흐름**(날짜 탭 → 마커/동선 → 영업 상태 → 알람)이
동작한다. 지도만 키가 필요하다.

### Supabase 연결

```bash
npx supabase login
npx supabase link --project-ref <PROJECT-REF>
npx supabase db push                # 0001, 0002 마이그레이션 적용
npm run db:types                    # DB 타입 생성
```

그 후 대시보드 → Database → Extensions에서 `pg_cron`, `pg_net`을 켜고
`supabase/migrations/0002_functions.sql` 하단의 주석 블록을 실행한다.

### Vercel 배포

```bash
npm i -g vercel
vercel link
vercel env add NEXT_PUBLIC_SUPABASE_URL       # 나머지 키도 동일하게
vercel deploy --prod
```

---

## 7. 다음 단계

1. **인증** — Supabase Auth 붙이기. 현재 `trip` RLS가 `auth.uid()`를 요구하므로,
   로그인 없이는 여행 저장이 불가능하다. (목 데이터는 이 때문에 넣어둔 것)
2. **드래그 앤 드롭 재정렬** — `reorderStops` / `reorder_trip_stops` RPC는 이미 준비됨. UI만 필요.
3. **Web Push** — `push_subscription` 테이블과 `pending_alarms` 뷰는 준비됨.
   Service Worker + Edge Function `dispatch-alarms` 구현이 남음.
4. **영업시간 보강** — 네이버 Local Search는 영업시간을 주지 않는다.
   구글 Places Details로 보강하거나 수동 입력 UI가 필요하다.
5. **지역 확장** — `src/lib/geo/regions.ts`에 객체 하나만 추가하면 된다.
   네이버 미지원 지역은 자동으로 구글로 고정된다.

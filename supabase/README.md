# Supabase 전환 준비 — 실연결 아님

Pixel Class 전용 프로젝트가 연결되지 않아 기존 Supabase 서비스에는 변경하지 않았습니다. SQLite가 계속 실행 저장소이며 실제 Supabase 클라이언트 어댑터는 구현하지 않았습니다.

## 포함된 준비물

- CLI `supabase migration new`로 생성한 `migrations/*_pixel_class_v02_preparation.sql`
- 격리된 `pixel_class` 스키마와 비공개 권한 함수용 `pixel_private` 스키마
- 학교·프로필(Auth 사용자 연결)·학적·1:1 캐릭터·교실·책상·배정·초대·프로젝트·교안·질문/피드백/제출/AI 자식 테이블
- 프로젝트 공개 메타데이터와 비공개 상세/자식 데이터의 분리
- 전체 테이블 RLS 및 학교·소유자·MASTER별 SELECT 정책
- 인증 클라이언트 직접 쓰기 차단, 서버 전용 원자적 입학/학적 RPC
- 같은 학교의 입학/자리 변경은 advisory transaction lock과 행 잠금으로 직렬화
- 이전 자리 복원 우선, 최대 120개 슬롯에 따른 공간 확장
- 읽기 전용 카탈로그 검사 `scripts/verify-supabase.sql`
- PGlite의 PostgreSQL 엔진에서 실행한 오프라인 DDL/RLS/RPC 테스트 (`tests/supabase-preparation.test.ts`)

오프라인 테스트는 Supabase Auth의 `auth.uid()`와 `auth.users`를 테스트용으로 대체합니다. 실제 Supabase Auth/Storage/Realtime/네트워크/복구/동시성 부하를 검증한 것이 아닙니다. 로컬 테스트의 성공을 운영 연결 완료로 해석하면 안 됩니다.

## 실제 전환 순서

1. 전용 테스트 Supabase 프로젝트를 만들고 SQLite를 일관된 방식으로 백업합니다. 이미 사용 중인 다른 서비스 프로젝트에는 적용하지 마세요.
2. CLI 현재 도움말과 연결 대상을 확인하고 새 프로젝트에만 준비 SQL을 적용합니다. SQL은 독립 스키마 생성이며 기존 SQLite를 수정하지 않습니다. 적용 전 권한·RPC 인자·인덱스를 검토합니다.
3. 프로젝트 관리자 연결로 `psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-supabase.sql`을 실행합니다. 비밀 값은 환경 설정/비밀 저장소에서 제공하고 로그에 출력하지 않습니다.
4. 실제 Auth에서 테스트 계정을 만들고 SQLite 사용자 ID↔Auth UUID 매핑을 작성합니다. 비밀번호 해시는 재사용하지 않으며 새 인증/초대 절차를 진행합니다.
5. `server/storage/contracts.ts`의 원격 저장소 포트를 구현하고 HTTP/학습 서비스를 비동기 호출로 전환합니다. 현재 동기 SQLite 어댑터를 네트워크 요청으로 단순 교체하면 안 됩니다. 세션·초대·AI 사용량에 남은 SQL도 원격 저장소/인증 경계로 옮깁니다.
6. Auth 계정 생성은 외부 서비스 작업이므로 DB 입학 트랜잭션과 하나의 원자적 작업이 아닙니다. 인증 계정 생성 후 원자적 `admit_student` RPC가 학적·책상·초대 소모를 처리하며, 미입학 계정은 RLS로 학교 데이터에 접근하지 못해야 합니다.
7. RPC는 `service_role`에만 실행 권한이 있습니다. 서버는 세션을 검증하고 사용자/학교/MASTER 권한을 검사한 뒤 호출해야 합니다. 서비스 키를 브라우저에 노출하지 마세요. 임의의 actor/student 인자를 클라이언트에서 받아 그대로 넘기면 안 됩니다.
8. Storage API 또는 대시보드에서 비공개 버킷을 만들고 파일을 옮깁니다. 이 SQL은 Storage 테이블을 직접 수정하지 않습니다. 다운로드 시 학교/학적/프로젝트 소유권 확인 후 짧은 서명 URL을 발급합니다.
9. Realtime 채널의 학교별 인증/권한을 설계합니다. 공개 프로젝트의 비공개 내용이 방송되지 않도록 기존 content-free refresh 원칙을 유지합니다.
10. SQLite 데이터/첨부파일을 ID와 생성 시각을 보존해 복사한 뒤 건수·해시·소유권·타 학교 차단을 비교합니다. 원본 DB는 읽기 전용 백업으로 보관하고 복구 시험 전 삭제하지 않습니다.
11. 실제 계정으로 기존 통합/브라우저 시나리오와 30명 입학을 다시 검증한 후 배포합니다.

인증된 사용자는 SQL 단계에서 scoped SELECT만 가능하고, INSERT/UPDATE/DELETE는 허용하지 않았습니다. API를 직접 쓰는 완성된 Supabase 앱이 아닌, 기존 서버 권한 검사를 유지하는 전환 기반입니다. 공개 API 스키마에 `pixel_class`를 추가할지, 서버 전용으로 둘지도 실제 어댑터 설계 때 결정해야 합니다.

참고: https://supabase.com/docs/guides/database/postgres/row-level-security · https://supabase.com/docs/guides/database/views · https://supabase.com/docs/guides/storage/schema/design

## v0.4 데이터 보존 추가 조건

v0.4의 `ai_school_usage` 학교별 일일 사용량도 향후 PostgreSQL 어댑터/데이터 이관에 포함해야 합니다. 기존 준비 SQL은 이 새 테이블의 실제 운영 이관까지 완성한 것이 아닙니다. 호출 예약과 프로젝트 질문 저장은 같은 트랜잭션으로 옮기고, 클라이언트가 사용량을 초기화하거나 수정하지 못하게 서버 전용 쓰기 권한을 검증해야 합니다. Realtime은 공식 문서의 private channel과 `realtime.messages` RLS를 적용하고, 학적 회수 시 이미 연결된 JWT/채널의 권한 캐시도 재검증해야 합니다.

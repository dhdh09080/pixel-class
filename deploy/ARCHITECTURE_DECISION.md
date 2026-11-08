# v0.4 배포 결정: 단일 지속 Docker 서버

2026-11-08. 지금은 Express·SQLite WAL·WebSocket을 유지합니다. 기존 학생 데이터·세션·초대·첨부·권한·교실 동기화의 보존과 실제 비공개 학교 접속을 우선합니다.

| 판단 기준          | 단일 Docker + SQLite + WebSocket                                                   | Supabase 기반 전환                                                                                     |
| ------------------ | ---------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| 현재 구현과 데이터 | 현재 코드/DB·첨부 bytes·세션 계약을 그대로 사용. 이행 위험이 작음                  | 사용자 ID↔Auth UUID, 동기 SQL→비동기 저장소, 첨부→Storage, 채널 인증을 실제 이관해야 함                |
| 두 컴퓨터의 접속   | 하나의 HTTPS 도메인→Caddy→단일 앱으로 API/WSS/정적 파일을 공유                     | 프런트 배포와 전용 Supabase 프로젝트가 필요. Auth/학교 가입/RLS/Storage/Realtime 각각 검증             |
| 인증               | 초대/비밀번호/서버 세션/역할·학적 검사. 이메일 확인·복구·MFA는 미구현              | 관리형 Auth가 장점. 실제 이메일/복구·초대·학적 검사를 결합해야 하며 RLS가 자동으로 완성되지는 않음     |
| 저장·복구          | 지속 볼륨·온라인 백업·새 DB 복원. 호스트와 외부 백업 담당 필요                     | 관리형 PostgreSQL·Storage. 플랜별 백업/복구·스토리지 권한/비용 확인 필요                               |
| 실시간             | 검증된 단일 프로세스 소켓·속도/충돌/학적 검사 유지                                 | 고빈도 게임 이동은 private Broadcast/Presence와 별도 검증 필요. DB 행 쓰기로 모든 이동을 대체하지 않음 |
| 확장·장애          | 단일 인스턴스/호스트 장애가 한계. 같은 SQLite를 여러 앱에 붙이지 않음              | 여러 앱 인스턴스와 관리형 데이터 확장에 유리. 권한 캐시·연결 수·요금 검증 필요                         |
| 현재 가용성        | 코드는 준비되어 있고 로컬 Docker 검증 가능. 외부 호스트/DNS/secret은 연결되지 않음 | 연결된 4개는 다른 서비스 프로젝트이며 Pixel Class 전용 없음. 기존 서비스 재사용/변경 안 함             |

## 실제 접속 구조

MASTER 컴퓨터와 학생 컴퓨터가 **같은 학교 HTTPS 도메인**으로 접속합니다. Caddy의 별도 테스트 접근 제한과 TLS를 통과한 후 각자의 앱 계정/쿠키를 사용합니다. 정적 파일·API·WSS를 같은 출처로 제공하므로 학생이 서버 IP/DB 주소/API 키를 입력할 필요가 없습니다. SQLite와 모든 첨부는 앱의 `/app/data` named volume에만 저장합니다. 앱 3001 포트와 Docker 소켓은 외부에 노출하지 않습니다.

외부 접속은 VPN 인터페이스 또는 방화벽을 설정한 호스트의 443으로 제한하고, `PUBLIC_ORIGIN`은 정확한 공통 HTTPS 출처로 고정합니다. ACME를 쓰면 소유 도메인의 DNS와 검증용 80/443 경로가 필요합니다. 로컬 `tls internal`/`localhost` 테스트가 공인 TLS나 외부 접속 검증을 뜻하지 않습니다.

## Vercel 검토

연결된 Vercel 계정/프로젝트를 읽기 전용으로 확인했으며 Pixel Class 연결은 없었습니다. 현재 가이드는 Fluid Functions의 WebSocket과 컨테이너 이미지를 지원한다고 명시합니다. 따라서 “Vercel은 WebSocket 자체가 불가능하다”는 이유로 제외하지 않습니다. 컨테이너도 **자동 확장되는 stateless Functions**라는 점이 현재 단일 SQLite 파일·프로세스 메모리 presence·지속 볼륨 계약과 맞지 않아 이번에는 배포하지 않았습니다. 프런트만 따로 올려 작동하지 않는 데모 URL을 만들지도 않았습니다.

참고: https://vercel.com/docs/functions/container-images · https://vercel.com/docs/functions/websockets · https://vercel.com/docs/services

## 전환을 재검토할 조건

이메일 확인/복구·MFA, 여러 인스턴스, 운영 담당 축소가 우선이 되고 전용 Supabase와 테스트 권한이 준비되면 전환합니다. SQLite 원본/온라인 백업을 보존하고 별도 테스트 프로젝트에서 ID 매핑, RLS, 비공개 Storage, private Realtime, 호출 예약/사용량, 학적 회수, 이관 건수/해시/복구를 검증한 뒤 전환합니다. 준비 SQL의 오프라인 RLS 검사 통과만으로 실제 연결 완료를 선언하지 않습니다.

공식 Realtime 문서: https://supabase.com/docs/guides/realtime/authorization · https://supabase.com/docs/guides/realtime/getting_started

환경의 제한 정책으로 `supabase.com/changelog.md` 직접 요청은 CONNECT 403으로 차단되었습니다. 공식 문서 검색 커넥터로 private 채널/RLS·권한 캐시 지침을 확인했으며 네트워크 정책/인증을 우회하지 않았습니다. 이번 작업에서는 원격 Supabase 스키마를 변경하지 않았습니다.

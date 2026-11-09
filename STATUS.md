# Pixel Class v0.5 현황

2026-11-09 KST. **Railway OAuth 연결·프로젝트와 배포 초안은 준비했습니다. 배포 적용이 승인되지 않아 실제 외부 배포와 URL은 아직 없습니다.** v0.4 기능·디자인·데이터·Compose를 유지합니다.

| 항목                    | 실제 상태                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git 기준                | v0.4 PR #3은 `42191e8`로 main 병합 완료. #1→#2→#3과 기존 main CI #28 성공 확인                                                                                                  |
| v0.5                    | #4→#5 main 병합 `da25fe7`, CI #35·main #36 전체92개 성공. 500MB 현재 계정 한도와 Railway 초안 상태를 후속 문서에 반영                                                           |
| Railway 프로젝트/서비스 | OAuth 연결 성공. 비공개 프로젝트 pixel-class `c46ee1d7-c441-4b23-a3f2-f1d349c9f504`, private-test 환경. 서비스 a64cd7e5-f18b-47ac-a714-d2322cca69e7은 staged-create·미실행      |
| 실제 배포 URL/ID        | **없음 / 없음**                                                                                                                                                                 |
| 배포 구조               | Railway HTTPS edge → Express 정적 React/Phaser·API·WSS 한 서비스 → `/app/data` SQLite WAL. scoped TypeScript IaC, replica1, health/restart/drain                                |
| 실제 Volume             | school-data `2e639437-1dd9-4ba4-a078-976d2eb2136d` 500MB /app/data **초안**. 현재 플랜 max500MB 확인. 아직 provision/실제 마운트/DB 생성 없음                                   |
| DB                      | SQLite 유지, 스키마 변경/기존 데이터 삭제 없음. Supabase Auth/Postgres/Storage/Realtime 실제 전환 없음                                                                          |
| 인증                    | 비공개 HTTP/WSS 접근 암호·MASTER 부트스트랩 변수 **초안** 등록(원문 비공개). 실제 sealed 여부 미검증. 로컬 초대/세션/학교·역할·학적·프로젝트·파일 권한 검증, 외부 MASTER 미등록 |
| 테스트                  | 기존86+신규6 = **92/92 로컬·CI #35/main #36 통과**. 서버56+브라우저34+Compose1+Railway 형태1. 역할 전환 지연 재현/회귀와 root 코드 읽기/쓰기 권한 강화 포함                     |
| 실제 사용               | 별도 Chromium 두 세션: MASTER 초대→학생 외모/책상→이동/온라인→프로젝트→교안 업로드/다운로드→피드백/알림→재로그인/재생성/복원. 다른 IP 클라이언트2개의 HTTPS/WSS·채팅도 검사     |
| 화면/성능               | Railway 형태 1366×768/390×844 화면, 기존5해상도/접근성, CPU4배 감속·80ms·1.5Mbps 노트북/모바일 에뮬레이션. 실물 기기/클라우드 용량 인증 아님                                    |
| HTTPS/WSS               | 로컬 CA 체인/호스트명 검증 성공. 익명/틀린 접근 암호·유효 세션만 있는 WSS 차단. **Railway 공인 URL/외부 WSS 미검증**                                                            |
| OpenAI                  | Railway 기본 AI_ENABLED=false. 키/모델 형태가 있어도 비활성/503. 활성화 시 학교 UTC 하루3회 이하·동시1개 강제. 실제 키·응답·품질·비용 평가 없음                                 |
| 비용/관측               | 플랜 상향/실행 리소스 provision 없음. 1GB 요청은 현재 계정500MB 한도로 거부되어 조정. 실제 크레딧/요금·Usage 알림·지출 제한·원격 메모리/디스크·외부 백업 미설정                 |
| 공개 운영               | 이메일 검증/복구/MFA·외부 인수 미완료. 초대된 소규모 비공개 테스트로만 준비, 공개 운영 보류                                                                                     |

[v0.5 Railway 보고서](V05_RAILWAY_REPORT.md) · [변수/배포/복원/비용 절차](deploy/railway/README.md) · [런타임 증거](docs/v05/runtime-check.json) · [기존 v0.4 보고서](V04_RELEASE_REPORT.md) · [기존 Compose 운영](deploy/README.md).

다음 단계는 **배포 적용 승인 → 서비스/Volume 실제 생성 → HTTPS 도메인·PUBLIC_ORIGIN·실행 제한/비밀 보호 확인 → 외부 두 컴퓨터 인수**입니다. Railway accept-deploy가 사용자 미승인으로 취소되어 서비스·Volume·변수 초안만 저장돼 있습니다. 토큰/키를 채팅이나 Git에 입력하지 않습니다. 실제 성공 후에만 외부 URL과 배포 완료 상태를 갱신합니다.

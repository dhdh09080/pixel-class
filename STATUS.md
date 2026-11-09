# Pixel Class v0.5 현황

2026-11-09 KST. **Railway 운영 코드는 준비했지만 실제 외부 배포는 미완료이며 URL은 없습니다.** v0.4 기능·디자인·데이터·Compose를 유지합니다.

| 항목                    | 실제 상태                                                                                                                                                                                                                                             |
| ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Git 기준                | v0.4 PR #3은 `42191e8`로 main 병합 완료. #1→#2→#3과 기존 main CI #28 성공 확인                                                                                                                                                                        |
| v0.5                    | `feature/pixel-class-v05`, 구현 `577147f`. [PR #4](https://github.com/dhdh09080/pixel-class/pull/4)→main `0c0c77b`, CI #30 성공. root launcher 코드 소유권 추가 보완은 [PR #5](https://github.com/dhdh09080/pixel-class/pull/5)와 최종 병합 기록 참조 |
| Railway 프로젝트/서비스 | 현재 대화에 호출 가능한 도구·토큰·로그인 없음. 계정/프로젝트 권한 미확인, 원격 자원 미생성                                                                                                                                                            |
| 실제 배포 URL/ID        | **없음 / 없음**                                                                                                                                                                                                                                       |
| 배포 구조               | Railway HTTPS edge → Express 정적 React/Phaser·API·WSS 한 서비스 → `/app/data` SQLite WAL. scoped TypeScript IaC, replica1, health/restart/drain                                                                                                      |
| 실제 Volume             | Railway **미연결**. 로컬 root-owned Volume→UID1000/CapEff0·DB0600, 볼륨/DB 누락 거부·안전 초기화·새 파일 복원 검증                                                                                                                                    |
| DB                      | SQLite 유지, 스키마 변경/기존 데이터 삭제 없음. Supabase Auth/Postgres/Storage/Realtime 실제 전환 없음                                                                                                                                                |
| 인증                    | 비공개 HTTP/WSS 접근 암호 + 기존 초대/세션/학교·역할·학적·프로젝트·파일 권한. 로컬 두 계정 검증, **외부 MASTER 미등록**                                                                                                                               |
| 테스트                  | 기존86 유지 + 신규6 = **92개**(서버56+브라우저34+Compose1+Railway 형태1). 최종 실행·CI 증거는 V05 보고서                                                                                                                                              |
| 실제 사용               | 별도 Chromium 두 세션: MASTER 초대→학생 외모/책상→이동/온라인→프로젝트→교안 업로드/다운로드→피드백/알림→재로그인/재생성/복원. 다른 IP 클라이언트2개의 HTTPS/WSS·채팅도 검사                                                                           |
| 화면/성능               | Railway 형태 1366×768/390×844 화면, 기존5해상도/접근성, CPU4배 감속·80ms·1.5Mbps 노트북/모바일 에뮬레이션. 실물 기기/클라우드 용량 인증 아님                                                                                                          |
| HTTPS/WSS               | 로컬 CA 체인/호스트명 검증 성공. 익명/틀린 접근 암호·유효 세션만 있는 WSS 차단. **Railway 공인 URL/외부 WSS 미검증**                                                                                                                                  |
| OpenAI                  | Railway 기본 AI_ENABLED=false. 키/모델 형태가 있어도 비활성/503. 활성화 시 학교 UTC 하루3회 이하·동시1개 강제. 실제 키·응답·품질·비용 평가 없음                                                                                                       |
| 비용/관측               | 유료 자원 생성/플랜 변경 없음. 실제 요금·Usage 알림·지출 제한·원격 메모리/디스크·외부 백업 미설정                                                                                                                                                     |
| 공개 운영               | 이메일 검증/복구/MFA·외부 인수 미완료. 초대된 소규모 비공개 테스트로만 준비, 공개 운영 보류                                                                                                                                                           |

[v0.5 Railway 보고서](V05_RAILWAY_REPORT.md) · [변수/배포/복원/비용 절차](deploy/railway/README.md) · [런타임 증거](docs/v05/runtime-check.json) · [기존 v0.4 보고서](V04_RELEASE_REPORT.md) · [기존 Compose 운영](deploy/README.md).

다음 단계는 **Railway 앱/공식 인증 연결 → 계정/비용·plan 검토 → 지속 Volume·sealed 비밀·실제 HTTPS 도메인 설정 → 외부 두 컴퓨터 인수**입니다. 토큰/키를 채팅이나 Git에 입력하지 않습니다. 실제 성공 후에만 외부 URL과 배포 완료 상태를 갱신합니다.

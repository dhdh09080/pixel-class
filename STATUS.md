# Pixel Class v0.6 수업 운영 현황

2026-11-10 KST. main의 v0.6 실행 소스가 Railway SUCCESS임을 후속 조회로 확인했습니다. 비공개 학교 주소: https://pixel-class-private-test.up.railway.app/

## main에 구현된 수업 기능

- 공용 접근 암호 + 개인 계정, 학생별 1회용 초대와 1~30명 일괄 초대
- 가입 중 4개 캐릭터 스타일 선택·세부 꾸미기·계정별 책상 자동 배정
- MASTER의 학생·학적·프로젝트·질문·교안·공지 관리, 실시간 이동·채팅
- 과제 대상과 한국 시간 마감 배정·연장·보관, 개인별 제출/재제출·지각 표시
- 선생님의 미제출/제출/지각/확인 집계 및 피드백·보완 요청
- 학생별 제출물과 복구 KEY의 권한·학교 격리, 오래된 제출/피드백 쓰기 충돌 차단
- 본인 비밀번호 변경, 선생님의 학생 복구 링크(30분·1회·해시 저장), 이전 세션 철회
- 학교 파일 총량 120MiB 및 디스크 여유 보호, 사용량 화면
- 시작 시/6시간 간격 서버 백업, MASTER의 학교별 세션 제외 백업 다운로드

## 배포 구조

Railway pixel-class/private-test, 단일 Express가 React/Phaser·API·WebSocket을 제공합니다. 500MB school-data Volume을 `/app/data`에 연결하고 SQLite WAL을 유지합니다. 기존 계정·학생 기록·DB를 초기화하지 않습니다. Dockerfile은 Railway가 지원하지 않는 secret mount 옵션을 사용하지 않습니다. main·배포용 브랜치·수업용 기능 브랜치의 CI를 실행하며 main에서는 실제 HTTPS 주소의 릴리스 헤더·health·비공개 접근 차단을 추가 검사합니다.

현재 실행 중인 정확한 커밋과 배포 성공 여부는 [Railway](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)와 [GitHub CI](https://github.com/dhdh09080/pixel-class/actions)에서 확인합니다. 과거 V05_RAILWAY_REPORT.md의 승인 대기 기록은 당시 이력이며 현재 상태로 사용하지 않습니다.

## 검증과 남은 범위

수업용 기능 서버 통합 검사는 권한·학교 격리·마감·제출 충돌·단일 복구·세션 철회·일괄 초대·학교별 백업을 검사합니다. 실제 Chromium 별도 세션으로 가입·모바일 캐릭터 선택·과제 배정→제출→피드백→계정 복구→같은 캐릭터/제출 복원을 검사하며, 기존 전체 회귀·컨테이너 운영 검사를 보존합니다. 이 기능은 main PR #7의 기존102개 검사에 포함되어 있습니다. 이번 통합 회귀 결과와 실제 실행 소스는 아래와 배포 보고서에 기록합니다.

이메일 확인·이메일 자동 복구·MFA·외부 자동 백업·실제 AI 연결·Windows 앱은 제공하지 않습니다. 현재 서버 백업은 같은 디스크에 있으므로 PC 다운로드를 함께 사용합니다. AI는 비활성이며 비용이 발생하는 새 서비스나 요금제 상향을 추가하지 않습니다.

[교육 시작 순서](README.md#오늘-교육-시작하기-v06)

## 실제 Railway 확인과 통합 검증

2026-11-10 KST. **Railway 실제 배포 성공(`SUCCESS`), 비공개 외부 인수 대기.** 이전 승인 대기/URL 없음 기록을 갱신합니다.

| 항목                     | 상태                                                                                                                                                                         |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실제 URL                 | <https://pixel-class-private-test.up.railway.app>                                                                                                                            |
| 프로젝트 / 환경 / 서비스 | `pixel-class` / `private-test` / `pixel-class`, [Railway](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)                                                  |
| 배포                     | `a427cac4-806c-4d0f-bf5f-75a8d655f7a2`, SUCCESS / Online / 1 running, 적용 대기 없음                                                                                         |
| 실행 소스                | `main` @ `c7218ad9ac4635a5916149397e79a0f8fbb9806d` (v0.6) 고정. main 갱신과 실행 소스는 구분                                                                                |
| Volume / DB              | live `school-data` 500MB `/app/data` sfo. SQLite WAL 유지, Supabase 전환·기존 DB 삭제 없음. 실제 DB 직접 조회/원격 복원은 미검증                                             |
| 인증                     | 공용 암호 폼·서명 쿠키 + 계정 세션·초대·학교/역할/소유권 검사. 로컬 통과. 실제 과거 bootstrap/register/login 성공 이력 있음; 현재 계정 상태는 미조회                         |
| 비밀                     | 변수 값은 OAuth에서 가림. 실제 sealed 목록은 비어 있으므로 소유자 UI의 Seal 작업 필요. 비밀 원문 공개/재발급 안 함                                                           |
| 검사                     | 최신 main 통합: 단위/통합68 + 브라우저35 + Railway 운영1 + Compose 운영1 = 105/105 로컬 통과. 운영 의존성 audit 취약점0. 최종 PR CI는 보고서 참조                            |
| 실제 HTTPS/WSS           | 기존 main CI42757062609 live 성공: 실제 HTTPS 릴리스0.6.0·health·입구·익명 경로/틀린 암호/Origin 차단. Codex 직접 HTTPS는 CONNECT403. 외부 두 계정/WSS101/재배포 보존 미완료 |
| 네트워크 제한            | 도메인 허용 요청 후에도 현재 인스턴스는 allowed_hosts=[] / restricted / enforced. 현재 환경 반영 또는 새 환경 필요                                                           |
| 화면 / 성능              | 기존5해상도·접근성·노트북/모바일 CPU4배 감속 검사 통과. 새 로컬 증거 `docs/v05/release-check/`; 실물 기기 인증 아님                                                          |
| 원격 자원                | 최근1시간 메모리 약0.08675GB·제한 약1GB, 디스크 지표 약0.03382GB. 단일 관측이며 Volume 사용률/부하 보증 아님                                                                 |
| AI                       | OpenAI 키/모델 변수 없음·실제 호출 미실행. 기본 비활성. 연결 시 학교 하루3회/동시1개부터 시작                                                                                |
| 비용 / 백업              | 기존 리소스 유지·플랜 상향 없음. 실제 청구/잔액·지출 경보·외부 백업 스케줄 미확인/미설정                                                                                     |
| 공개 운영                | 이메일 검증/복구/MFA·외부 인수 미완료. 공개 운영 보류                                                                                                                        |

[V05_RAILWAY_REPORT.md](V05_RAILWAY_REPORT.md)에 실제 ID·검증 결과·남은 설정·Git/CI를 기록합니다. [Railway 운영 지침](deploy/railway/README.md) · [기존 Compose](deploy/README.md).

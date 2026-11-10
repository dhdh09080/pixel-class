# Pixel Class 상태

2026-11-10 KST. **Railway 실제 배포 성공(`SUCCESS`), 비공개 외부 인수 대기.** 이전 승인 대기/URL 없음 기록을 갱신합니다.

| 항목                     | 상태                                                                                                                                                 |
| ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실제 URL                 | <https://pixel-class-private-test.up.railway.app>                                                                                                    |
| 프로젝트 / 환경 / 서비스 | `pixel-class` / `private-test` / `pixel-class`, [Railway](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)                          |
| 배포                     | `9b0ae91c-fe82-46c5-8258-c8b2c3513922`, SUCCESS / Online / 1 running, 적용 대기 없음                                                                 |
| 실행 소스                | `deploy/railway-private-test` @ `1b85bd108485bec7f26aa038084d252fe3611cfc` 고정. main 갱신과 실행 소스는 구분                                        |
| Volume / DB              | live `school-data` 500MB `/app/data` sfo. SQLite WAL 유지, Supabase 전환·기존 DB 삭제 없음. 실제 DB 직접 조회/원격 복원은 미검증                     |
| 인증                     | 공용 암호 폼·서명 쿠키 + 계정 세션·초대·학교/역할/소유권 검사. 로컬 통과. 실제 과거 bootstrap/register/login 성공 이력 있음; 현재 계정 상태는 미조회 |
| 비밀                     | 변수 값은 OAuth에서 가림. 실제 sealed 목록은 비어 있으므로 소유자 UI의 Seal 작업 필요. 비밀 원문 공개/재발급 안 함                                   |
| 검사                     | 단위/통합59 + 브라우저34 + Railway 형태 운영1 통과. Compose 운영1 통과. 총95/95 로컬 성공; CI는 보고서 참조                                          |
| 실제 HTTPS/WSS           | 플랫폼 도메인/health·과거 HTTP 요청 확인. 이번 Codex 직접 HTTPS는 CONNECT403, 외부 두 계정/WSS101/실제 재배포 보존 미완료                            |
| 네트워크 제한            | 도메인 허용 요청 후에도 현재 인스턴스는 allowed_hosts=[] / restricted / enforced. 현재 환경 반영 또는 새 환경 필요                                   |
| 화면 / 성능              | 기존5해상도·접근성·노트북/모바일 CPU4배 감속 검사 통과. 새 로컬 증거 `docs/v05/release-check/`; 실물 기기 인증 아님                                  |
| 원격 자원                | 최근1시간 메모리 약0.093GB·제한 약1GB, 디스크 지표 약0.0335GB. 단일 관측이며 Volume 사용률/부하 보증 아님                                            |
| AI                       | OpenAI 키/모델 변수 없음·실제 호출 미실행. 기본 비활성. 연결 시 학교 하루3회/동시1개부터 시작                                                        |
| 비용 / 백업              | 기존 리소스 유지·플랜 상향 없음. 실제 청구/잔액·지출 경보·외부 백업 스케줄 미확인/미설정                                                             |
| 공개 운영                | 이메일 검증/복구/MFA·외부 인수 미완료. 공개 운영 보류                                                                                                |

[V05_RAILWAY_REPORT.md](V05_RAILWAY_REPORT.md)에 실제 ID·검증 결과·남은 설정·Git/CI를 기록합니다. [Railway 운영 지침](deploy/railway/README.md) · [기존 Compose](deploy/README.md).

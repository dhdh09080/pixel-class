# 운영 개선 검증 자료

앱 런타임과 장시간 검사 소스는 `79f2363ac71524f0fc24fa99273212b5f3700492`에 고정했습니다. 후속 변경은 문서·테스트 프로세스 제한과 재현 도구입니다. 실제 Railway 적용과 외부 인수 범위는 [STATUS.md](../../STATUS.md), 기능·실패 수정은 [이번 보고서](../../OVERNIGHT_OPERATIONS_REPORT.md)를 기준으로 합니다.

| 경로                                                   | 의미와 제한                                                                                                                  |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `runtime/frozen-source.json`                           | 수정 없는 별도 작업 공간의 소스·빌드 지문. 설치된 의존성은 기존 설치에서 hard link로 재사용                                  |
| `runtime/docker-runtime-equivalence.json`              | 전체 Dockerfile 빌드의 런타임 56개 파일이 고정 소스/빌드와 일치                                                              |
| `runtime/railway-metrics-before.json`                  | 적용 전 플랫폼의 24시간 자원 관측. 실제 요금·잔액·Volume 사용률은 아님                                                       |
| `runtime/npm-audit-production.json`                    | 운영 의존성 알려진 취약점 검사. 전체 보안 인증은 아님                                                                        |
| `operations/status-1366.png`, `status-390.png`         | MASTER 운영 화면, 실제 로컬 API 백업/재검증 후 노트북·모바일 캡처                                                            |
| `competition/history-390.png`, `score-review-1366.png` | 실제 가입한 두 계정과 독립 심사 세션에서 버전 비교·평가 제외/복원                                                            |
| `compose-profile/`, `railway-profile/`                 | 별도 로컬 HTTPS edge와 실제 계정·WSS·파일·DB 복원. Railway 인터넷 인수와 구분                                                |
| `regression/`                                          | 이번 전체 브라우저 검사가 촬영한 화면. 과거 릴리스 자료는 덮어쓰지 않음                                                      |
| `avatar/before/`, `avatar/after/`                      | 동일한 네이티브 렌더러/입력의 개선 전후 접촉 시트. 각 370조합·4,440자세를 검사. 육안 품질 99% 또는 모든 조합을 보장하지 않음 |
| `performance/nameplate-repeat.json`                    | 재현 가능한 9회 교차 측정. 정지한 이름표 배치만 측정하며 전체 게임 FPS·요금은 아님                                           |
| `load-30-before/`, `load-30-after/`                    | 동시 QA가 있는 호스트에서 각 300초. 기존 98% 기준을 변경하지 않고 실패·개선을 함께 기록                                      |
| `load-30-isolated/`                                    | 전체 브라우저 회귀 종료 후 별도 300초 재측정. 6개 브라우저 소크와는 같은 호스트를 공유                                       |
| `soak-smoke/`                                          | 91초 빠른 검증. 2시간 검사의 대체 자료가 아님                                                                                |
| `soak-development/`                                    | 최종 코드 재고정 전에 의도적으로 중단한 진단 자료. 완료/통과로 집계하지 않음                                                 |
| `soak-2h/`                                             | 최종 소스의 실제 6개 Chromium 컨텍스트 반복 결과. 파일의 sourceCommit·actualSeconds·passed·정리 후 소켓 수를 함께 확인       |

캡처는 로컬 가상 학생·교사 데이터로 만들었으며 운영 사용자의 비밀번호, KEY, 자료, DB 파일은 포함하지 않습니다. 30개 소켓은 30개 렌더링 브라우저가 아니며, 자동 접근성 검사는 실물 기기 사용성이나 WCAG 인증을 대신하지 않습니다.

다시 실행하려면 저장소 루트의 Node.js24 환경에서 아래 명령을 사용합니다. 모두 별도의 일회용 DB/학교를 사용하며 운영 DB를 대상으로 실행하지 않습니다.

```sh
npm test
npm run test:e2e
node --import tsx scripts/benchmark-nameplates.mjs
QA_OUTPUT_DIR=docs/overnight/avatar/recheck node scripts/capture-avatar-qa.mjs
QA_OUTPUT_DIR=docs/overnight/load-recheck LOAD_SECONDS=300 node scripts/load-realtime.mjs
QA_OUTPUT_DIR=docs/overnight/soak-recheck SOAK_SECONDS=7200 node scripts/soak.mjs
```

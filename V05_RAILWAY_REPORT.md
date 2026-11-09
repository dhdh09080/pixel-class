# Pixel Class v0.5 — Railway 운영 준비·검증 보고

2026-11-09 KST. **코드와 로컬 운영 검증은 완료했지만 실제 Railway 배포는 미완료입니다. 외부 배포 URL은 없습니다.** 계정 접근을 연결해야 실제 프로젝트·Volume·도메인·변수 설정과 외부 인수를 진행할 수 있습니다.

## Git·배포 상태

| 항목                    | 확인 결과                                                                                                                                                              |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 저장소/시작 main        | `dhdh09080/pixel-class`, `42191e83fc3a51073b54d3880468e552b4f0c093`                                                                                                    |
| 기존 PR/CI              | #1→#2→[v0.4 #3](https://github.com/dhdh09080/pixel-class/pull/3) 병합 완료. main [CI #28](https://github.com/dhdh09080/pixel-class/actions/runs/42490469960) 86개 성공 |
| 작업 브랜치/구현        | `feature/pixel-class-v05`, `577147f` (`feat: secure Railway runtime and persistent school deployment`). 후속 문서/증거는 브랜치 커밋 목록 참조                         |
| v0.5 PR/CI              | [PR #4](https://github.com/dhdh09080/pixel-class/pull/4), 최신 head와 CI는 [Checks](https://github.com/dhdh09080/pixel-class/pull/4/checks) 참조                       |
| Railway 프로젝트/서비스 | **미생성·미조회**. `pixel-class`는 제안 이름이며 실제 자원 이름/ID가 아님                                                                                              |
| 실제 배포 URL/ID        | **없음 / 없음**                                                                                                                                                        |
| 실제 Volume             | **미연결**. 제안 1GB `/app/data`, 실제 플랫폼 ID·지역·요금 미확인                                                                                                      |
| 최초 MASTER             | 로컬 QA 생성/복원/재로그인 통과. **외부 학교 MASTER 미등록**                                                                                                           |
| 실제 HTTPS/WSS          | Railway 공인 TLS/외부 WSS는 **미검증**. 로컬 CA 검증 HTTPS/WSS는 성공                                                                                                  |
| DB/AI                   | SQLite WAL 유지, 스키마 변경 없음. Supabase 전환 없음. 실제 OpenAI 키/모델·호출·품질·비용 평가 없음                                                                    |

Railway 플러그인은 설치·활성 상태로 표시되지만 **현재 대화에 호출 가능한 Railway 도구가 없습니다**. 환경에도 Railway 토큰·로그인 설정·연결된 비밀이 없었습니다. 계정/프로젝트 자체가 없다고 판단한 것은 아닙니다. GitHub 읽기·푸시·PR 권한과 최신 main은 확인했습니다.

Railway CLI는 사전 설치되지 않았고, 공식 고정 버전 CLI의 `whoami` 시도는 설치 단계 exit1로 끝나 계정 조회에 성공하지 못했습니다. 런타임 Railway 문서 접속도 CONNECT403으로 제한됐습니다. 공식 문서는 별도 검색 도구로 확인했습니다. 로컬 브라우저 연결과 Cloud CUA가 불가능해 환경의 Chromium/Playwright로 제품을 검증했습니다. 인증이나 네트워크 정책을 우회하지 않았고 유료 자원 생성·플랜 변경도 실행하지 않았습니다.

## 구현 결과

- **같은 출처의 단일 서버**: 기존 Dockerfile/Express/React·Phaser/SQLite/WSS·Compose를 유지합니다. PORT/HOST, PORT 기반 Health Check, 최소 공개 probe, ON_FAILURE 재시작, replica1,15초 drain, 중첩 배포0을 설정했습니다. 기존 SIGTERM 소켓 정리를 사용합니다.
- **현재 Railway IaC**: `.railway/railway.ts`는 공식 SDK `railway@3.16.0`을 개발 의존성으로만 사용합니다. 이름 있는 partial로 서비스1·볼륨1을 정의하고 sealed 변수 보존·Dockerfile 빌더를 선언합니다. SDK 그래프·타입은 검사했지만 **실제 CLI plan/apply·플랫폼 인수는 미실행**입니다. 새 서비스에서 사용할 수 없는 구형 railway.json/toml은 추가하지 않았습니다.
- **시작 조건**: production, demo=false, HOST/PORT, 정확한 HTTPS PUBLIC_ORIGIN, Secure 쿠키, 신뢰 프록시1홉을 강제합니다. 원본 앱/DB 포트를 따로 공개하지 않는 구성입니다. 실제 플랫폼 헤더 전달과 TLS는 원격 인수 대상입니다.
- **지속 데이터 보호**: 실제 Linux mountinfo와 플랫폼 Volume 변수를 함께 검사합니다. Dockerfile의 암묵적 익명 Volume 생성만 제거하고 Compose의 명시적 볼륨을 보존했습니다. 볼륨 없이 임시 DB로 시작하지 않습니다.
- **비특권 실행**: root launcher는 데이터 디렉터리/선택 DB·WAL·SHM·marker의 권한만 준비하고 UID/GID1000·보조 그룹 없음으로 전환한 뒤 서버를 execve합니다. 디렉터리0700·파일0600·umask077이며 root 앱 실행과 DB/WAL/SHM의 심볼릭/하드 링크를 거부합니다. 재귀 chown·기존 데이터 삭제를 하지 않습니다.
- **새 학교와 복원 구분**: 기본 DATABASE_MODE=existing은 DB 누락을 거부합니다. 완전히 빈 새 Volume의 명시적 create+강한 MASTER KEY만 초기화하며 marker가 생긴 뒤에는 DB가 없어져도 재초기화하지 않습니다. 기존 DB의 quick_check·필수 테이블을 읽기 전용으로 확인합니다. 복원은 새 파일명+existing을 사용하고 원본을 덮어쓰지 않습니다.
- **비공개 HTTP/WSS gate**: 사용자명 pixel·독립 난수 접근 암호를 양쪽에 요구합니다. MASTER 부트스트랩 KEY와 같은 암호는 거부합니다. 본문 파싱 전 차단, private/no-store를 적용하고 기존 초대·계정 세션·학교·역할·학적·소유권 검사를 유지합니다. GET health만 최소 응답으로 공개합니다.
- **비밀과 오류**: 저장소 밖 0600 비밀 생성 도구와 sealed 변수 보존 선언을 추가했습니다. 기존 파일을 덮어쓰거나 키를 로그에 출력하지 않습니다. AI 전송 제외 목록에 접근 암호를 추가했습니다. 요청/비밀이 섞일 수 있는 예외 메시지를 기록하지 않고 잘못된 JSON400·과대 본문413을 한국어로 안내합니다.
- **AI 기본 차단**: Railway AI_ENABLED=false는 키/모델 형태가 있어도 연결 표시와 호출을 차단합니다. 켤 때는 학교 UTC 하루3회 이하·동시1개를 시작 조건으로 검사합니다. 기존 원자적 예약·개인 한도·30초 timeout·최대1200 출력 토큰·문맥/민감정보 제한을 유지합니다. 실제 연결·응답 품질·비용은 미검증입니다.
- **디자인 보존**: 포레스트 그린/크림 UI·48×64 캐릭터·외모·교실을 유지하고 버전과 비공개 학교 문구만 맞췄습니다.

## 검증

기존86개 유지 + 신규6개 = **92개: 서버/단위/통합56 + 기존 Playwright34 + 기존 Compose 운영1 + 새 Railway 형태 운영1**입니다. 볼륨 fixture의 assertion, 클라이언트나 스크린샷을 별도 테스트로 중복 합산하지 않습니다.

| 실행                                       | 결과·범위                                                                                                                                                                                         |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm test`                                 | 56/56. 기존51+새5: 접근 암호, 마운트, 운영/AI 정책, IaC 안전 설정, 비밀 생성                                                                                                                      |
| `npm run test:e2e`                         | 34/34. 기존 실제 사용 흐름·5해상도·접근성·충돌/이동·노트북/모바일 감속 검사                                                                                                                       |
| `npm run test:operations`                  | 1/1. 기존 Compose/Caddy 실계정2개·교안 UI/다운로드·WSS·재생성·백업/복원·세션 철회·독립 네트워크 유지                                                                                              |
| `npm run test:railway`                     | 새1/1+볼륨 보호 assertion. TLS-only edge 뒤 Express/WS gate, PORT8080, root 볼륨→UID1000/CapEff0/DB0600, 최소 health·익명 차단·유효 세션만 있는 WSS401, AI 강제 비활성, 전체 사용/복원·두 IP 교환 |
| `npm run typecheck`, `npm run build`       | 통과. 기존 Phaser 약1.37MB(gzip 약357KB) chunk 경고 유지                                                                                                                                          |
| `npm run format:check`, `git diff --check` | 최종 문서·증거 포함 통과, 원격 최종 결과는 PR Checks 참조                                                                                                                                         |
| `npm audit --omit=dev --audit-level=high`  | 알려진 취약점0 보고. 전체 보안 인증이나 취약점 부재 보장은 아님                                                                                                                                   |

부정 사례는 실제 마운트 없음, root 앱 실행, existing의 DB 누락, 약한 초기 KEY, marker 후 DB 생성 중단, 손상 DB, DB/WAL symlink를 거부하고 파일 내용을 보존합니다. 다른 학생/학교 자료, 초대 재사용, 파일 접근과 세션 교체·철회는 기존 회귀 및 동일 운영 흐름에서 계속 검사합니다.

각각 별도 Chromium 세션의 MASTER/STUDENT가 부트스트랩 → 초대 링크/KEY → 학생 계정/외모 → 자동 책상 → 이동/2명 표시 → 프로젝트 → 교안 업로드/학생 열람·다운로드 → MASTER 피드백/알림을 수행했습니다. 재로그인·컨테이너 재생성 후 외모/책상/파일/피드백을 확인하고, 온라인 백업을 **새 DB**로 복원해 세션 철회·재로그인·내용 보존을 확인했습니다. 두 개의 다른 Docker 네트워크 주소에서도 HTTPS/WSS·채팅·프로젝트·교안·피드백을 교환했습니다.

계정은 일회용 QA이며 실제 학생 개인정보가 아닙니다. 종료 시 자체 생성 QA 자원만 정리했습니다. **물리 PC2대·공용 인터넷·실제 Railway 재배포를 검증한 것은 아닙니다.**

### 화면·성능·용량 증거

- [Railway 형태 노트북 교실](docs/v05/classroom-1366x768.png), [390px 교실](docs/v05/classroom-390x844.png), [학생 피드백](docs/v05/student-feedback.png).
- [노트북 감속 측정](docs/v05/device/office-laptop.json), [모바일 감속 측정](docs/v05/device/mobile.json): CPU4배 감속·80ms·1.5/0.75Mbps·캐시 비활성. 준비 표본 약12.4초/11.8초, RAF p95 약16.8ms/16.7ms, JS 오류 없음. 실물 기기·Phaser FPS 인증이나 빠른 초기 로딩으로 해석하지 않습니다. 루프백 HTTP는 Railway HTTPS 압축/네트워크와 다릅니다.
- [프로세스/저장소 검사](docs/v05/runtime-check.json): UID/GID1000·CapEff0·PORT8080·앱 포트 비게시, DB/WAL0600. RSS는 `/proc/1/status` 단일 표본입니다. 가상화 환경의 Docker aggregate stats는 앱 전용 메모리로 해석할 수 없어 결론에 사용하지 않았습니다. 설정한 1GB 제한의 실제 강제 여부도 이 환경에서 보장하지 않습니다.
- 최종 후보 로컬 이미지 약261MB, 작은 QA DB 약72KiB. 실제 학교 용량이나 Railway 요금 추정은 아닙니다.
- [독립 클라이언트 결과](docs/v05/network-peers.json)는 externalDeployment:false입니다. 기존 v0.2/v0.3/v0.4 증거를 보존하고 새 표본만 docs/v05에 저장했습니다.

### 실패·수정·재검사

1. 처음에는 YAML flow 속 tmpfs 쉼표가 별도 mount로 해석됐습니다. 하나의 문자열로 고친 뒤 시작했습니다.
2. 로컬 HTTPS가 예상401을 반환하지 않은 시도는 Caddy 프록시 환경의 앱 내부 통신 예외가 빠진 구성이었습니다. 기존 운영과 같은 NO_PROXY를 추가하고 익명401·인증200·전체 흐름을 통과했습니다.
3. 중간 후보는 작업 환경 ENOSPC로 마지막 독립 컨테이너 생성에 실패했습니다. DB/학교 볼륨을 건드리지 않고 ID로 확인한 이 프로젝트의 미사용 빌드 캐시만 정리해 재검사했습니다. 실패를 성공으로 집계하지 않았습니다.
4. SDK 원시 그래프의 preserve 표현과 실제 변수 구성을 구분해 sealed+preserveExisting을 검사했습니다. 실제 Railway plan/apply 검증과 구분합니다.

## 남은 설정·차단 요인

1. **Railway 접근 활성화**: 이 대화의 Railway 앱 도구 또는 환경 비밀을 통한 공식 CLI 인증. 토큰/키는 채팅에 입력하지 않습니다. 계정·프로젝트·GitHub 권한 조회부터 필요합니다.
2. **비용 확인/승인**: 실제 플랜/잔액, 서비스·1GB Volume·네트워크·백업 예상 비용을 검토하고 필요한 새 비용 승인을 받습니다. 기존 자원 삭제·플랜 상향은 하지 않습니다.
3. **플랫폼 설정**: 단일 서비스·지속 Volume·실제 도메인/PUBLIC_ORIGIN·독립 sealed 비밀2개, 새 DB create 또는 검증한 기존 백업 existing. plan에 삭제/교체가 없는지 확인합니다.
4. **외부 인수**: 두 컴퓨터의 실제 테스트 계정으로 HTTPS/WSS·전 흐름·재배포 보존·접근 제한·프로세스 UID·원격 로그를 검증합니다. 성공 후 URL/프로젝트/배포 ID를 STATUS에 기록합니다.
5. **운영 백업/비용 경보**: Volume 백업 스케줄·외부 암호화 백업/복원 연습·Railway Usage 알림/지출 제한·원격 메모리/디스크 관측은 미설정입니다.
6. **선택적 AI 연결**: 기본 꺼짐 유지. 시험 시에만 서버 전용 OpenAI key/model·AI_ENABLED=true·학교 하루3회/동시1개와 공급자 소액 예산/경보를 함께 설정합니다. 실제 품질 평가 결과는 아직 없습니다.

이메일 검증·비밀번호 복구·MFA와 외부 보안 인수가 남아 있어 공개 운영을 승인하지 않습니다. **실제 비공개 학교 개통은 아직 미완료**입니다. 변수·초기화·복구/롤백·비밀·비용·공식 문서 근거는 [Railway 운영 지침](deploy/railway/README.md)에 있습니다.

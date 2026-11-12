# Railway 비공개 테스트 학교 운영

이 문서는 **배포·운영 절차**입니다. 2026-11-10 실제 `pixel-class/private-test` 서비스가 SUCCESS이며 <https://pixel-class-private-test.up.railway.app>과 500MB `/app/data` Volume이 실행 중입니다. 현재 Codex 네트워크가 해당 호스트를 차단해 외부 두 계정 인수는 미완료입니다. 상세 상태는 [배포 보고서](../../V05_RAILWAY_REPORT.md)를 확인하세요. 기존 `compose.yaml` + Caddy 운영 방식도 유지합니다.

## 구성과 사전 조건

Railway HTTPS 프록시 → 단일 Express(React/Phaser 정적 파일 + API + `/socket`) → `/app/data` 영구 Volume의 SQLite WAL입니다. Caddy는 Railway 서비스에 배포하지 않습니다. 외부 TCP 프록시와 DB 공개 포트, 추가 replica, CDN 캐시, 자동 절전은 사용하지 않습니다. 배포 전후에는 잠시 연결이 끊길 수 있으며 기존 SIGTERM 처리로 소켓을 정리합니다.

`.railway/railway.ts`는 공식 `railway@3.16.0` SDK를 사용하는 **이름 있는 partial**입니다. 기존 프로젝트의 다른 서비스를 관리하지 않도록 계획을 검토하세요. 새 서비스에서 사용할 수 없는 구형 `railway.json`/`railway.toml`을 추가하지 않았습니다. CLI는 공식 최신 호환 버전(현재 확인한 5.71.0, SDK 최소 5.42.1 이상)을 사용합니다.

현재 live: 프로젝트 c46ee1d7-c441-4b23-a3f2-f1d349c9f504, 환경3a0dc4b5-3a92-4478-92e7-8a0927b1f09e, 서비스a64cd7e5-f18b-47ac-a714-d2322cca69e7, 볼륨2e639437-1dd9-4ba4-a078-976d2eb2136d(sfo·500MB). 실제 소스는 `main` @ `c7218ad` (v0.6) 고정입니다. 아래 새 배포 절차를 기존 학교에 다시 적용하거나 DB를 초기화하지 마세요. IaC의 main 선언과 live 소스는 다르므로 변경 전 plan을 검토합니다.

필요 권한은 Railway 프로젝트/환경/서비스/Volume/변수/도메인 관리, GitHub 저장소 연결 권한입니다. 기존 리소스와 결제 상태부터 조회하고 **새 유료 리소스의 예상 비용을 승인받은 뒤** 생성합니다. 다른 프로젝트/학생 볼륨을 삭제하거나 요금제를 올리지 않습니다. 지역은 계정에서 사용 가능한 가까운 지역으로 서비스와 Volume을 함께 정하고 plan에서 확인합니다.

## 변수와 초기화

| 변수                                               | 운영값 / 의미                                                                           |
| -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `PIXEL_RUNTIME`                                    | `railway` (플랫폼 `RAILWAY_PROJECT_ID`가 있어도 보호 활성화)                            |
| `NODE_ENV`, `DEMO_MODE`                            | `production`, `false`                                                                   |
| `HOST`, `PORT`                                     | `0.0.0.0`, `8080`; 플랫폼 포트 변경 시 Health Check와 생성 도메인 대상 포트도 동일하게  |
| `PUBLIC_ORIGIN`                                    | 실제 생성한 `https://…` 출처 하나. 경로·끝 슬래시·자리표시자 금지                       |
| `COOKIE_SECURE`, `TRUST_PROXY_HOPS`                | `true`, `1`; Express 포트를 별도 공개하지 않음                                          |
| `DATABASE_PATH`                                    | `/app/data/school.sqlite`                                                               |
| `DATABASE_MODE`                                    | 기본 `existing`. **데이터가 없는 새 Volume에 최초 한 번만** `create`                    |
| `RAILWAY_RUN_UID`                                  | `0`; launcher만 root로 권한 준비, 실제 서버는 UID/GID 1000                              |
| `MASTER_BOOTSTRAP_KEY`                             | 32바이트 난수, 서버 전용 **sealed variable**. 최초 MASTER 등록 후 제거 가능             |
| `STAGING_ACCESS_KEY`                               | 위 KEY와 다른 32바이트 난수, **sealed variable**. 학생과 교사에게 별도 보안 경로로 전달 |
| `RAILWAY_VOLUME_NAME`, `RAILWAY_VOLUME_MOUNT_PATH` | 플랫폼이 주입. 경로 `/app/data`; 수동으로 가짜 값을 넣지 않음                           |
| `AI_ENABLED`                                       | 기본 `false`. 키가 존재해도 AI 호출/연결 표시 차단                                      |
| `AI_SCHOOL_DAILY_CALLS`, `AI_MAX_CONCURRENT`       | `3`, `1`. AI 사용을 명시적으로 켤 때도 이 시험 상한을 초과하면 시작 거부                |
| `OPENAI_API_KEY`, `OPENAI_MODEL`                   | 기본 미설정. 시험 승인 후 서버 전용 sealed key + 접근 가능한 모델                       |

접근용 난수 두 개는 저장소 **밖의 기존 개인 디렉터리**에 생성할 수 있습니다. 값을 화면·로그에 출력하지 않고 0600 파일을 새로 만듭니다. 기존 파일을 덮어쓰지 않습니다.

```sh
npm run railway:secrets -- /absolute/private/directory/pixel-railway-secrets.env
```

Railway 변수 UI의 안전한 입력 기능으로 두 값을 **sealed**로 저장하는 것을 권장합니다. 현재 MCP의 변수 쓰기에는 sealed 옵션이 없으며 실제 sealedVariableNames는 빈 목록입니다. 소유자 UI에서 두 비밀에 Seal을 적용해야 합니다. OAuth 연결에는 일반 변수도 이름만 반환됩니다. 일반 커밋·PR·채팅·명령 인자에 값을 붙이지 않습니다. IaC의 `preserve()`/`preserveExisting`은 이미 저장한 값을 유지하는 선언이며 비밀을 생성하거나 누락된 값을 채워주지 않습니다. `.railway/railway.ts`의 `PUBLIC_ORIGIN`도 실제 도메인을 설정해야 합니다. Railway 로컬 연결 파일/plan/환경 덤프는 Git에 넣지 않습니다.

## 실제 배포 순서

1. Railway 앱 도구를 이 대화에서 활성화하거나 공식 CLI를 인증합니다. 토큰은 환경의 비밀 설정에 주입하고 출력하지 않습니다. 읽기 요청으로 계정·프로젝트·환경·잔액/요금/역할을 확인합니다.
2. 기존 `pixel-class` 프로젝트가 있으면 자원 ID·Volume·기존 데이터를 먼저 조사합니다. 없을 때만 비용 검토 후 생성합니다. GitHub 연결에서 이 저장소에 대한 권한을 확인합니다. 배포 소스는 CI를 통과한 최신 main입니다.
3. 연결된 프로젝트/테스트 환경에서 `railway config plan`으로 partial의 추가/수정 범위를 확인합니다. **삭제·볼륨 교체·복제·예상 밖 변경이 있으면 apply하지 않습니다.** `--show-values`를 사용하지 않습니다. 이 세션에서는 실제 plan/apply를 실행하지 못했습니다.
4. 단일 서비스, Dockerfile 빌더, 500MB Volume `/app/data`, Health Check `/api/health`, 재시작 ON_FAILURE(최대5), drain15초, replica1·CDN 꺼짐을 적용합니다. Start Command는 별도 덮어쓰기 없이 Docker CMD의 `node scripts/start.mjs`를 사용해야 합니다. 기존 서비스에 start override·TCP proxy·다른 domain이 있으면 plan과 실제 설정을 먼저 조사합니다. Volume은 런타임에만 연결되므로 **pre-deploy 명령으로 DB를 만들지 않습니다**. 정지/재배포 중 잠깐의 중단은 허용합니다.
5. HTTPS 도메인을 생성하고 대상 `PORT`를 확인합니다. 정확한 `PUBLIC_ORIGIN`과 위 보안 변수·sealed 비밀을 설정합니다. 처음에는 DB/변수 누락으로 unhealthy인 상태를 성공으로 판정하지 않습니다.
6. 새 학교는 **완전히 빈 새 Volume**임을 확인한 후 `DATABASE_MODE=create`로 배포합니다. 기존 학교는 아래 백업 복원 절차와 `existing`을 사용합니다. 기존 SQLite 파일을 삭제하거나 데모 DB로 덮어쓰지 않습니다.
7. 외부에서 익명 `/`·`/api/config`·파일·`/socket`이 401이고 `/api/health`만 `{"ok":true}`인지 확인합니다. 브라우저 HTML 요청은 401 안내형 **교실 접근** 폼을 표시합니다. `STAGING_ACCESS_KEY`를 입력하면 HttpOnly·Secure·SameSite=Lax 서명 쿠키(7일)를 발급한 뒤 로그인 또는 원래 초대 링크로 이동합니다. 호환 Basic 방식의 사용자명은 **pixel**, 암호도 `STAGING_ACCESS_KEY`입니다. 이는 계정 로그인/초대 KEY와 별도입니다.
8. MASTER 등록은 별도의 부트스트랩 KEY로 최초 한 번만 진행합니다. 교무실에서 학생용 일회용 초대를 발급합니다. 학생에게는 부트스트랩 KEY를 전달하지 않습니다. 테스트는 가짜 이메일/개인정보로만 합니다.
9. 최초 DB가 정상 생성되면 `DATABASE_MODE=existing`으로 변경하고 재배포합니다. MASTER 등록 후 부트스트랩 KEY를 제거합니다. 학생 책상·프로젝트·교안·피드백·로그인이 유지되는지 확인합니다.
10. 실제 서로 다른 두 컴퓨터에서 가입, 캐릭터, 이동, 온라인 표시, 채팅, 프로젝트, 피드백, 교안 파일, 새로고침/재로그인, 재배포 후 보존을 검증하고 URL·서비스/배포 ID·시각·결과를 STATUS에 기록합니다. **현재 이 외부 검증은 미실행입니다.**

## 볼륨과 복구

앱은 플랫폼의 볼륨 메타데이터뿐 아니라 Linux mountinfo의 정확한 `/app/data` 마운트도 검사합니다. Dockerfile의 암묵적 익명 `VOLUME` 생성은 제거했고 Compose의 명시적 볼륨은 유지했습니다. 볼륨이 없으면 임시 디렉터리에 DB를 만들지 않습니다.

루트 launcher는 최상위 데이터 디렉터리(0700)와 선택한 DB/WAL/SHM/초기화 marker의 소유권만 UID1000으로 맞춘 뒤 보조 그룹·root 권한을 버립니다. 재귀 chown이나 파일 삭제를 하지 않습니다. 실제 Node 서버의 UID/GID1000·CapEff0은 컨테이너 QA에서 검사합니다. 새 파일은 umask077입니다. root launcher·서버·공유 코드·dist·package는 root 소유이며 앱 사용자는 읽기/실행만 할 수 있습니다. 소유권 변경 때문에 읽기까지 막히지 않도록 release 디렉터리/파일 권한을 정규화합니다. 쓰기 가능한 파일시스템에서 앱 UID가 launcher와 상위 디렉터리를 수정할 수 없는지도 QA합니다. Railway 실제 프로세스/마운트 상태는 배포 후 다시 검사해야 합니다.

기존 파일은 읽기 전용 SQLite quick_check와 필수 Pixel Class 테이블을 확인합니다. 빈 파일·다른 DB·손상·심볼릭 링크·하드 링크는 거부합니다. 새 DB 생성 전에 `.pixel-class-volume.json`을 독점 생성하므로 초기화 중 프로세스가 죽거나 이후 DB 파일이 사라지면 `create`가 남아 있어도 다시 빈 학교를 만들지 않습니다. 이 경우 **marker를 지워 재시도하지 말고** 원인을 조사하고 검증한 백업을 복원하세요.

기존 `scripts/database.mjs`의 온라인 backup/verify/restore를 사용합니다. 실행 중인 SQLite 파일 하나만 복사하면 WAL 데이터가 빠질 수 있습니다. 원본 DB와 Volume을 보존하고, 백업을 검증한 뒤 **새 파일명**(예: `/app/data/restored.sqlite`)으로 restore합니다. 복원은 계정/첨부/피드백/사용량을 유지하고 세션을 철회합니다. 해당 경로와 `DATABASE_MODE=existing`으로 전환하고 재로그인·내용을 확인합니다. 원본 파일을 덮어쓰지 않습니다. 기존 백업 없이 원격 컨테이너로 임의의 DB를 복사하지 않습니다.

롤백은 같은 Volume과 검증한 기존 DB를 유지한 채 이전 코드로 되돌립니다. v0.5의 DB 스키마 변경은 없습니다. 외부 보안 저장소 백업과 복원 연습, Railway Volume 백업 스케줄·보존기간·과금 확인은 실제 계정 연결 후 수행해야 합니다. 같은 볼륨의 백업만으로 재해 복구가 완료되지는 않습니다.

## 비용·보안·AI 운영 제한

추가 운영 화면과 검증 정보는 [이번 운영 개선 보고서](../../OVERNIGHT_OPERATIONS_REPORT.md)를 확인하세요. MASTER의 **내 계정과 운영 → 학교 운영 상태**는 마지막 API 응답 시각·런타임 사용량·학교 AI 호출 수·서버 백업의 마지막 검증 결과를 표시합니다. 같은 Volume 백업이나 다운로드 준비만으로 별도 보관 완료로 표시하지 않습니다.

학교 백업 다운로드 후 상태를 새로고침해 **최근 학교별 다운로드 검증 정보**의 파일명과 SHA-256을 확인합니다. 허용된 별도 저장소에 보관한 파일을 `npm run db:verify -- "파일.sqlite" --sha256 EXPECTED_SHA256`으로 검사할 수 있습니다. 실행 중인 DB의 main 파일 하나를 복사해 이 명령으로 검증하지 마세요. WAL/journal이 있는 스냅샷은 독립 파일 해시 검증을 거부하며, SQLite online backup으로 일관된 사본을 먼저 만들어야 합니다.

복원은 앱을 중지하고 새 파일명에만 수행합니다. 현재 CLI는 계정·작품·피드백·사용량·입학 이력을 보존하되, 세션·심사 KEY·복구 KEY를 폐기하고 과거 입학 KEY를 철회합니다. 다시 초대할 학생은 새 KEY를 발급해야 합니다. 평가 제외/복원 기능을 사용한 대회를 옛 코드로 되돌리면 집계가 달라질 수 있으므로 먼저 결과 공개를 철회하고 해당 기능을 지원하는 버전을 사용하세요.

Railway [사용량 한도](https://docs.railway.com/pricing/cost-control#usage-limits)의 이메일 알림은 서비스를 중단하지 않는 soft limit이며, hard limit에 도달하면 워크로드가 중단됩니다. 이번 작업에서 실제 계정의 청구액·잔액·경보 설정을 변경하지 않았습니다. 소유자가 허용한 월 예산과 중단 정책을 정한 뒤 Workspace의 Usage에서 설정하고, 한도 도달 전 별도 백업을 보관해야 합니다. Trial의 일회성 크레딧은 영구 무료 운영을 의미하지 않습니다.

- 1개 인스턴스와 500MB 볼륨 제안은 **요금제/잔액 검증 결과가 아닙니다**. 배포 전 계정 플랜과 예상 CPU·RAM·볼륨·네트워크·백업 비용을 확인합니다. 기존 플랜을 올리지 않습니다. Railway Usage의 알림 및 지출 제한을 설정하고, 제한에 따른 서비스 중단·볼륨 처리 정책을 확인합니다. 현재 계정의 비용 관측/알림은 미설정입니다. 계정 API가 허용한 Volume 상한은500MB이며1GB 초안 요청은 거부됐습니다. 플랜을 상향하지 않고500MB로 맞췄습니다.
- 배포 후 Railway Metrics와 로그에서 메모리·CPU·디스크·재시작·오류율을 확인합니다. 로컬 QA의 수치를 실제 학교 부하나 Railway 요금으로 일반화하지 않습니다. 인증 헤더·세션·초대·부트스트랩 값을 로그에 남기지 않습니다.
- 이메일 검증·복구·MFA가 없으므로 초대된 소규모 학교에만 제공합니다. 공용 접근 암호가 유출되면 sealed 값을 회전하고 재배포합니다. 개별 계정 로그아웃은 계정 세션을 철회하지만 **공용 입구 쿠키나 캐시된 Basic 인증을 지우지는 않습니다**. 입구 쿠키만으로는 프로젝트/파일/채팅에 접근할 수 없으며 계정 세션이 별도로 필요합니다. 공용 암호 회전 시 기존 서명 쿠키도 무효가 됩니다. 공용 PC에서는 별도 브라우저 프로필/시크릿 창을 닫습니다. 계정·학교·학적·소유권 검사는 공용 암호와 독립적으로 유지됩니다.
- AI는 `AI_ENABLED=false`로 시작합니다. 활성화 시 학교 전체 UTC 하루 최대3회, 동시1개, 개인 한도, 30초 timeout, 최대1200 출력 토큰, 실패도 횟수 차감입니다. **호출 수 제한은 달러 상한이 아닙니다**. OpenAI 프로젝트에서도 소액 예산/경보를 설정합니다. 실제 연결 후 정확성·초보자 이해도·보지 않은 코드 검토 주장 부재를 가짜 프로젝트로 평가합니다.

## 재현 가능한 로컬 QA

```sh
npm ci
npm run typecheck
npm test
npm run test:e2e
docker build -t pixel-class:ops-test .
npm run test:operations
npm run test:railway
```

Railway QA는 `deploy/railway/compose.test.yaml`로 **로컬 HTTPS edge만** 흉내 냅니다. edge에는 인증을 넣지 않아 실제 Express/WS 접근 검사를 검증합니다. PORT8080·root 소유 볼륨→권한 하향·실계정2개·WSS·DB 보존·백업/복원·다른 컨테이너 IP를 사용합니다. 실패해도 생성한 일회용 QA 자원만 정리합니다. 화면과 클라이언트 결과는 `docs/v05/`, Playwright 보고서는 `playwright-report/railway/`입니다. 실제 Railway 배포나 물리 PC 두 대의 인수 시험을 대체하지 않습니다.

공식 근거(2026-11-09 확인): [Volume 런타임·권한](https://docs.railway.com/volumes), [현재 IaC와 구형 구성 폐기](https://docs.railway.com/infrastructure-as-code), [IaC 필드](https://docs.railway.com/infrastructure-as-code/reference), [공개 HTTPS 네트워크](https://docs.railway.com/networking/public-networking).

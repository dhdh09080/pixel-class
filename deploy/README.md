# Pixel Class 비공개 운영 절차

Express + SQLite WAL + WebSocket을 유지하는 **단일 지속 서버** 구성입니다. Node 24.22.1과 Caddy 2.11.3 이미지를 digest로 고정했습니다. 로컬 Docker에서 HTTPS, 실제 계정 2개, 컨테이너 재생성, 온라인 백업과 새 DB 복원을 검증했습니다. **외부 호스트 배포와 공인 인증서 발급은 아직 하지 않았습니다.** 현재 결과는 [STATUS.md](../STATUS.md)에 기록합니다.

## 배포에 필요한 연결

- 지속 디스크를 제공하는 Linux 호스트, Docker Engine/Compose **2.24.4 이상**, SSH 또는 배포 접근 권한. 단일 앱 인스턴스와 최소 2GB 메모리를 권장합니다.
- 소유한 테스트 도메인과 DNS 변경 권한. 공인 TLS를 쓰면 도메인을 호스트에 연결하고 80/443 도달 가능 여부를 확인해야 합니다.
- 초대된 테스트 참여자에게만 제공할 접근 암호와 각자의 앱 계정. 가능하면 VPN/방화벽의 허용 IP도 제한합니다.
- 저장소 밖의 비밀 파일, 암호화한 외부 백업 위치, 디스크 용량/백업 실패/프로세스 재시작을 확인할 담당자.

현재 관리 환경에는 위 호스트 자격증명·도메인·전용 Supabase·OpenAI 키가 없습니다. 비공개 테스트 배포 자체는 요청 범위에 포함되어 있지만 **배포 대상 연결이 필요**합니다. 새 유료 자원 생성이나 DNS 변경은 대상·비용·소유권을 확인한 뒤 진행합니다. 비밀 값은 채팅이나 Git이 아닌 호스트/환경의 비밀 저장소에 입력하세요. Vercel 정적 사이트/일반 함수에 이 SQLite 서버를 배포하지 않습니다.

## v0.4 릴리스 점검

[배포 인수 조건](RELEASE_CHECKLIST.md)과 [비밀이 없는 구성 예제](compose.env.example)를 추가했습니다. `npm run deploy:check -- --env-file /srv/pixel-private/compose.env`는 실제 해석된 Compose 설정의 앱 포트 비노출·단일 인스턴스·지속 볼륨·정확한 HTTPS 출처·이미지 digest·secret 파일을 확인하고, 앱 UID의 네트워크 없는 일회성 검증 컨테이너에서 secret을 검사합니다. 학교 DB나 앱 서비스는 열지 않습니다. AI 사용 시 `--ai`를 더하고, 루프백 로컬 QA에만 `--local`을 사용합니다. 검사 성공은 실제 배포/DNS/공인 인증서 성공이 아닙니다.

## 비공개 호스트 설정

1. 검토한 Git 커밋을 체크아웃하고 `npm ci`, `npm test`, `npm run test:e2e`를 실행합니다. `docker build -t pixel-class:local .` 후 `npm run test:operations`를 실행하려면 `PIXEL_IMAGE=pixel-class:local`을 지정합니다. 후자는 격리된 임시 볼륨만 생성·제거합니다.
2. 저장소 **밖**에 소유자 전용 비밀 디렉터리를 만들고 파일 읽기 권한을 제한합니다. 예를 들어 `/srv/pixel-private`를 사용합니다. 컨테이너의 `node` UID/GID는 **1000:1000**이므로 `master-bootstrap` 파일은 이 사용자에게 읽기 가능해야 합니다. Linux 파일 기반 Compose secrets의 `uid`/`mode` 설정만으로 호스트 파일 권한이 바뀌지 않습니다.
3. 무작위 부트스트랩 키를 파일로 생성합니다. 실제 키를 명령 인자나 로그에 남기지 않습니다.

   ```sh
   umask 077
   openssl rand -hex 32 > /srv/pixel-private/master-bootstrap
   ```

   필요하면 호스트 관리자가 `chown 1000:1000 /srv/pixel-private/master-bootstrap` 및 `chmod 400`으로 읽기 권한을 맞춥니다. 상위 비밀 디렉터리도 제한하세요.

4. Caddy의 `hash-password` 대화형 입력으로 **앱 비밀번호와 다른 테스트 접근 암호**를 bcrypt로 해시합니다. 명령에는 평문 암호를 넣지 마세요.

   ```sh
   docker run --rm -it --network none --entrypoint caddy \
     caddy:2.11.3@sha256:ec18ee54aab3315c22e25f3b2babda73ff8007d39b13b3bd1bfffa2f0444c7d9 hash-password
   ```

   `/srv/pixel-private/staging-access.caddy`에 아래 스니펫을 저장합니다. `$2...`는 출력된 **실제 해시**로 바꾸며 따옴표나 쉘 치환으로 손상시키지 않습니다. Caddy는 이 파일이 없거나 올바르지 않으면 시작하지 않습니다.

   ```caddyfile
   basic_auth {
     tester $2a$...실제_bcrypt_해시...
   }
   ```

5. 저장소 밖의 `/srv/pixel-private/compose.env`에 경로와 비밀이 아닌 설정을 저장합니다. `PIXEL_DOMAIN`에는 프로토콜·경로를 넣지 않습니다. 기본 바인딩은 루프백입니다. 실제 원격 접근이 필요한 호스트에서만 VPN 인터페이스 주소 또는 `0.0.0.0`으로 바꾸고 방화벽/접근 암호를 함께 확인하세요.

   ```dotenv
   PIXEL_DOMAIN=class-test.example.com
   PIXEL_IMAGE=pixel-class:local
   PIXEL_BIND=127.0.0.1
   PIXEL_HTTP_PORT=80
   PIXEL_HTTPS_PORT=443
   MASTER_BOOTSTRAP_FILE=/srv/pixel-private/master-bootstrap
   STAGING_ACCESS_FILE=/srv/pixel-private/staging-access.caddy
   ```

   공인 ACME HTTP 검증은 도메인의 80/443이 Caddy까지 도달해야 합니다. 루프백만 바인딩한 상태로 외부 ACME 검증이 된다고 가정하지 마세요. VPN 전용이라면 조직에서 발급한 TLS 인증서 또는 DNS 검증 구성을 별도로 준비해야 합니다. 테스트용 `tls internal` 설정을 실제 외부 인증서로 사용하지 않습니다.

6. 아래처럼 구성 확인과 시작을 진행합니다. 운영에서는 **`down --volumes`를 사용하지 마세요.**

   ```sh
   docker compose --env-file /srv/pixel-private/compose.env config --quiet
   docker compose --env-file /srv/pixel-private/compose.env up -d --no-build --wait
   docker compose --env-file /srv/pixel-private/compose.env ps
   ```

7. `https://실제-테스트-도메인`에서 먼저 접근 암호를 확인한 뒤 부트스트랩 파일의 키로 최초 MASTER를 등록합니다. 키는 비밀번호 관리자나 호스트에서만 확인합니다. 이후 **초대 KEY → 별도 학생 계정 → 캐릭터 → 책상 → 프로젝트 → MASTER 피드백**을 실제 도메인에서 재검증하세요. 테스트 접근 암호는 앱의 MASTER 권한을 부여하지 않습니다.
8. 앱의 3001 포트가 외부에 열리지 않고, `Secure/HttpOnly/SameSite=Strict` 쿠키, 익명 접근 거부, 타 학생 비공개 프로젝트/파일 거부, WebSocket 연결·로그아웃 철회가 실제 호스트에서 동작하는지 확인합니다. 이메일 확인/복구/MFA는 아직 없어 초대된 제한 인원 테스트로 운영 범위를 한정합니다.
9. MASTER 등록 후 부트스트랩 파일을 제거하려면 별도 Compose override에서 `MASTER_BOOTSTRAP_KEY_FILE`을 빈 문자열로 하고 해당 secret mount·정의를 함께 제거합니다. 기존 MASTER가 있으면 두 번째 부트스트랩은 서버에서도 거부합니다.

앱은 비특권 사용자, 읽기 전용 루트, 쓰기 가능한 `/tmp`와 `/app/data`, capability 제거, `no-new-privileges`, 자원·로그 제한, 건강 검사, SIGTERM 종료를 사용합니다. 종료 시 새 HTTP/WS를 받지 않고 최대 5초를 기다린 뒤 남은 연결을 정리합니다. 진행 중인 AI 네트워크 요청은 중단될 수 있으므로 업데이트는 점검 시간에 하세요. `TRUST_PROXY_HOPS=1`은 Caddy 한 홉만 신뢰하는 설정입니다. 앱 포트를 다른 경로로 노출하거나 프록시를 추가하면 신뢰 범위를 다시 검토해야 합니다. 내부 `app` 통신은 외부 HTTP 프록시를 경유하지 않습니다.

## 백업·복원·업데이트

파일·사용자·초대·프로젝트·피드백은 SQLite에 포함됩니다. 앱이 실행 중인 WAL DB 파일 하나를 복사하지 마세요. 아래 CLI는 SQLite 온라인 백업 API와 `quick_check`/외래 키 검사를 사용합니다. 목적 파일이 있으면 덮어쓰지 않고 거부하며 백업/복원 파일은 0600입니다.

```sh
# 실행 중인 컨테이너에서 일관된 새 스냅샷 생성
# 매번 다른 파일명을 사용하세요.
docker compose --env-file /srv/pixel-private/compose.env exec -T app \
  node scripts/database.mjs backup /app/data/school.sqlite /app/data/backup-YYYYMMDD.sqlite

# 호스트의 제한된 백업 경로로 복사한 후 암호화하여 다른 저장소에 보관
docker compose --env-file /srv/pixel-private/compose.env cp \
  app:/app/data/backup-YYYYMMDD.sqlite /srv/pixel-private/backups/backup-YYYYMMDD.sqlite
```

백업에는 비밀번호 해시, 초대 해시, 세션 해시, 학생 콘텐츠와 파일이 있습니다. 원격 보관은 암호화하고 별도 접근 권한·보존 기한을 적용하세요. 최소 매일 및 버전 업데이트 전에 백업하며 실패 알림과 주기적인 복원 연습을 운영자가 설정해야 합니다. 이 저장소는 외부 백업 스케줄러를 자동 생성하지 않습니다.

복원은 점검 시간에 앱을 중지하고 **새 경로**에 수행합니다. 기존 DB와 WAL/SHM을 덮어쓰지 않습니다. `restore`는 과거 세션을 지워 유출되거나 오래된 로그인 세션이 되살아나지 않게 합니다. 계정·책상·프로젝트·파일·AI 사용량은 유지됩니다.

```sh
docker compose --env-file /srv/pixel-private/compose.env stop app
docker compose --env-file /srv/pixel-private/compose.env run --rm --no-deps app \
  node scripts/database.mjs restore /app/data/backup-YYYYMMDD.sqlite /app/data/restored-YYYYMMDD.sqlite
```

복원 결과의 `ok`, 건수와 `sessionsInvalidated=true`를 확인한 뒤 override의 `DATABASE_PATH`를 `/app/data/restored-YYYYMMDD.sqlite`로 지정하고 `up -d --no-deps --force-recreate --wait app`을 실행합니다. 두 계정으로 다시 로그인하여 데이터와 첨부 다운로드를 확인하세요. 원본 DB와 검증된 백업은 복원 확인 전 제거하지 않습니다. `verify` 명령으로 별도 파일 검사를 할 수 있습니다. 이전 버전으로 롤백할 때도 먼저 백업을 유지하고 호환성을 확인합니다.

## OpenAI 연결과 비용

실제 키와 모델이 없어 모델 호출은 미실행입니다. API는 503 안내를 반환하고 UI는 미연결 상태를 표시합니다.

1. 전용 OpenAI 프로젝트/권한 제한 API 키를 만들고 호스트의 비밀 파일에 저장합니다. `OPENAI_API_KEY_FILE`에는 그 파일의 **호스트 경로**, `OPENAI_MODEL`에는 해당 계정에서 사용할 수 있는 Responses API 모델 ID를 설정합니다. `VITE_` 환경 변수나 프런트엔드 빌드 인자에는 키를 넣지 않습니다.
2. `compose.yaml` 뒤에 `deploy/compose.ai.yaml`을 함께 사용하면 키 파일이 서버 전용 secret으로 마운트됩니다. 앱 UID 1000에 읽기 권한이 필요합니다.
3. 방화벽/프록시에서 `https://api.openai.com`의 서버 발신을 허용합니다. 이 Cloud 환경에서는 별도 네트워크 허용과 비밀 설정이 필요합니다. 검사형 프록시를 쓴다면 해당 CA를 런타임에 읽기 전용으로 마운트하고 Node의 `NODE_EXTRA_CA_CERTS` 및 `NODE_USE_ENV_PROXY=1`을 설정하세요. TLS 검증을 끄지 마세요.
4. 비공개 테스트 프로젝트에서 민감정보가 없는 질문 1건으로 한국어 6개 항목 응답·오류·제공자 사용량을 확인한 뒤 학생에게 사용을 허용합니다.

기존 제한은 **계정당 분당 5회·UTC 일일 20회·응답당 출력 1,200토큰·30초 타임아웃**, 최근 대화 10개입니다. 일일 횟수는 SQLite에 저장되어 재시작 후에도 유지하고 호출 실패도 차감합니다. 분당 제한은 단일 프로세스 메모리여서 재시작 시 초기화됩니다. 30명 모두 최대 사용하면 하루 최대 600회, 출력 상한만 720,000토큰이며 입력 토큰 요금이 별도입니다.

v0.4는 학교 전체 UTC 일일 호출 상한 `AI_SCHOOL_DAILY_CALLS`(기본 60)와 단일 앱 동시 호출 `AI_MAX_CONCURRENT`(기본 2)를 추가합니다. 학교 상한도 SQLite에 보존되며, 입력은 프로젝트 6000자+최근 대화 총 16000자로 제한합니다. 첫 실연결 평가에는 3회/일·동시 1개를 권장합니다.

앱에는 달러 단위의 강제 총액 차단이 없습니다. 모델별 최신 단가로 입력/출력 사용량을 계산하고 OpenAI 프로젝트의 예산·알림·모델 제한을 설정해야 합니다. 공급자 예산 알림이 즉시 강제 차단된다고 가정하지 말고 담당자가 확인하세요. 긴급 중지는 앱의 AI secret/model 제거 후 컨테이너 재생성 또는 제공자 키 철회로 수행합니다. 키가 설정되기 전에는 실제 비용·응답 품질을 검증했다고 보고하지 않습니다.

## 재현 가능한 로컬 운영 검사

```sh
docker build -t pixel-class:ops-test .
npm run test:operations
```

이 명령은 무작위 이름의 Compose 프로젝트와 임시 비밀 파일을 만들고 **127.0.0.1:8443만** 바인딩합니다. 다른 로컬 HTTPS 포트는 `OPS_HTTPS_PORT`로 지정합니다. 로컬 CA 체인·호스트명을 Node에서 검증하고 Chromium에는 그 테스트 인증서의 공개키만 허용합니다. 전체 TLS 검증 비활성화 옵션은 사용하지 않습니다. 공개 CA 발급 검증은 아닙니다.

접근 암호 없는 요청 401, 실제 계정 2개의 UI 흐름, WSS 이동, 권한/출처/세션 검사, 컨테이너 재생성, 온라인 백업·새 DB 복원·재로그인을 검사합니다. 가상 데모 역할 전환을 사용하지 않습니다. CI 호스트의 UID가 1000과 달라도 테스트용 부트스트랩 파일만 앱 UID 1000에 맞추고 0400 권한을 유지합니다. 테스트 종료 시 **자신이 만든 임시 프로젝트의 볼륨만** 제거합니다. 비밀번호·세션이 추적 파일에 남지 않도록 이 흐름의 Playwright trace는 끕니다. 테스트 계정은 일회용이며 실제 학생 데이터를 쓰지 않습니다.

이 Cloud의 빌드에는 검사 프록시 CA를 BuildKit secret으로 전달했습니다. 일반 호스트에는 필요하지 않습니다.

```sh
docker build --secret id=proxy_ca,src="$CODEX_PROXY_CERT" -t pixel-class:ops-test .
```

## 공개 운영 전 남은 조건

실제 도메인의 TLS/DNS·접근 제한·백업 알림·복원, 제한 인원 시험, 이메일 소유권/계정 복구·MFA 전략, 파일 전체 용량/악성 파일 검사·로그 보존 정책, 외부 부하/장시간/호스트 재부팅 검증이 남아 있습니다. 단일 SQLite 볼륨을 여러 앱 인스턴스에 붙여 수평 확장하지 마세요. 전용 Supabase가 마련되면 [전환 문서](../supabase/README.md)에 따라 복사본에서 Auth 매핑·RLS·Storage·Realtime를 먼저 검증합니다.

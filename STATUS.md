# Pixel Class 운영 품질·반별 경진대회 현황

검증 코드 **`fc4afc13ac2d6b164a9ca7ffa105ad7b5cba72de`**, [PR #13](https://github.com/dhdh09080/pixel-class/pull/13), [CI169개 성공](https://github.com/dhdh09080/pixel-class/actions/runs/43130365405). 서버119·브라우저48·Compose1·Railway 운영 프로필1을 확인했습니다. 새 기능 구현과 실제 서비스 적용은 구분합니다.

## 실제 배포와 데이터 — 사용자 Deploy 적용 후 갱신

- 비공개 주소: https://pixel-class-private-test.up.railway.app/
- Railway `pixel-class / private-test / pixel-class`, 실제 실행 소스 **`ad4d62f032f6636a476f20b6e8429d741fbd68af`**, 배포 `152e403f-7cb4-4a98-8732-6b76ce6217a0` 플랫폼 SUCCESS.
- 기존500MB `school-data` Volume `/app/data`, SQLite WAL·Express/WebSocket 단일 인스턴스를 유지합니다. 계정·사용자 자료·비밀 변수·볼륨을 삭제/초기화/재생성하지 않았습니다.
- Supabase 연결/전환 없음. 원격 DB 파일과 최신 백업 일관성은 직접 미검증이며, 로컬 및 CI의 재생성·백업·복원은 검증했습니다.
- 사용자께서 Deploy를 적용한 후2026-11-12 01:29 UTC에 새 배포 SUCCESS·Online·1 running을 확인했습니다. 대기 변경은 없습니다. 현재 Cloud의 HTTPS는 CONNECT403, Chromium은 ERR_TUNNEL_CONNECTION_FAILED로 외부 로그인·WSS 인수는 아직 미검증입니다.
- main 코드 병합 `ad4d62f`가 실제 Railway에 적용됐습니다. 기존500MB Volume·17개 변수·일반 시작 명령을 유지합니다. [새 플랫폼 기록](docs/production/live/platform-deployment.json) · [브라우저 접속 시도](docs/production/live/browser-reachability.json).
- OpenAI 키/모델 없음·AI 비활성. 실제 모델 품질/과금 검증은 미실행이며 연결 시 학교 하루3회·동시1회부터 시험합니다.

## main에 반영한 기능

- 기존 학생 입학·캐릭터·책상·프로젝트·교안·과제·질문·피드백·개인 알림·계정 복구를 보존합니다.
- 실제60×80 정수 도트와 헤어18·눈10·피부8·눈 색12·모자15·의상25·직업 코디17종. 성별 제한 없이 조합하며 기존 외모 ID/게임 크기와 얼굴·피부 보존을 검사했습니다.
- 반/대회·KST 일정·제출 버전/동결·안전한 HTML·독립 KEY 심사·서버35/30/20/15·중복 방지·평균/동점·명시적 결과 공개·교실 행사.
- 원본/공개 범위·동의·알림·복원 KEY 공격을 보강했고, 노트북 메뉴와 실시간 모바일 배너의 이동 버튼 겹침, 숨겨진 참가 명단을 수정했습니다.
- 실제 로컬 HTTPS/Volume에서 독립 심사91점·학교API401·재시작/복원 보존.6개 Chromium컨텍스트603초/67회 반복·30인 소켓61초·75개 UI캡처를 구분해 기록했습니다.

- 학교 인증 뒤 JS/CSS 압축과 공개 심사 캐시 분리. 같은 감속 조건의 진입 시간이 노트북13.94→5.67초·모바일13.90→6.08초로 감소했습니다.

[최종 운영 보고](PRODUCTION_FINAL_REPORT.md) · [전체 검증과 실패 이력](PRODUCTION_TEST_REPORT.md) · [대회 사용법](COMPETITION_FINAL_REPORT.md) · [대회 설계](COMPETITION_ARCHITECTURE.md) · [디자인 검토](PRODUCTION_DESIGN_REVIEW.md)

외부 운영 계정 로그인·WSS 인수·원격 백업 최신성 확인 전에는 공개 운영 준비 완료로 판정하지 않습니다. 이메일 소유권 확인/MFA·악성코드 검사·심사 정정/재심사 UI는 후속입니다.

## 이전 v0.6 릴리스 기록 (최신 후보 원본은 위60×80)

**미세 도트 아트: PR #12 main 병합 완료(`cb36f61`), CI120/120 성공.** 캐릭터192×256·재질 디테일·추천6코디와 교실/책상/로봇의 미세 원본을 구현했습니다. 실제 Railway는 기존67f84b5이고 대기 소스만cb36f61로 갱신했습니다. [최신 아트/실측/실행 상태](FINE_PIXEL_ART_REPORT.md).

이전 둥근 아트 이력. **둥근 캐릭터 PR #11 main 병합 완료(`58f2de9`), CI118/118 통과. 실제 Railway는 기존67f84b5이고, 배포 대기 소스를 새 둥근 버전58f2de9로 갱신했습니다.** 이전 도구 승인 거절 때문에 적용은 재시도하지 않았습니다. 둥근 머리·볼, 작은 눈·얇은 원형 안경과 부드러운 실루엣으로 수정했으며 저장 외모·계정·데이터는 유지합니다. [새 모습·검사·배포 상태](ROUND_CHARACTER_REPORT.md).

2026-11-10 이력(최신 상태는 위11일 기록 우선). 캐릭터 스튜디오·교실 입력/아트·MASTER 이름 설정은 PR #10으로 main에 병합했습니다(`6493895`). 당시 로컬·GitHub CI118/118 통과, Railway 적용은 승인 거절로 대기였습니다. [당시 보고서](CHARACTER_STUDIO_REPORT.md).

2026-11-10 KST. 기존 v0.6 실행 소스(`67f84b5`)의 Railway SUCCESS를 확인했습니다. 비공개 학교 주소: https://pixel-class-private-test.up.railway.app/

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

| 항목                     | 상태                                                                                                                                                                                |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 실제 URL                 | <https://pixel-class-private-test.up.railway.app>                                                                                                                                   |
| 프로젝트 / 환경 / 서비스 | `pixel-class` / `private-test` / `pixel-class`, [Railway](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)                                                         |
| 배포                     | `fb44aa92-27bc-411d-83ad-8954010861cc`, SUCCESS / Online / 1 running, 적용 대기 없음                                                                                                |
| 실행 소스                | `main` @ `67f84b5d957ca6eed65745b73400adbf3bc0ef00` (v0.6 + 소유자 인계 도구) 고정. main 갱신과 실행 소스는 구분                                                                    |
| Volume / DB              | live `school-data` 500MB `/app/data` sfo. SQLite WAL 유지, Supabase 전환·기존 DB 삭제 없음. 관리 도구의 기존 DB 무결성 검사·복구 전 백업 검증 완료. 원격 백업 복원 연습은 미실행    |
| 인증                     | 공용 암호 폼·서명 쿠키 + 계정 세션·초대·학교/역할/소유권 검사. 로컬 통과. 운영 MASTER 인계 applied:true 및 재실행 alreadyApplied:true 확인. 외부 실제 브라우저 로그인 검증은 미완료 |
| 비밀                     | 변수 값은 OAuth에서 가림. 두 비밀의 실제 Seal 확인. 공용 접근 암호를 Seal 유지로 갱신했고 서버 값과 전달 후보의 일치 확인                                                           |
| 검사                     | 소유자 인계 포함: 서버72 + 브라우저35 + Railway 운영1 + Compose 운영1 = 109/109 CI 통과. 복구 컨테이너·일반 로그인·안전한 재실행 검증 포함                                          |
| 실제 HTTPS/WSS           | 기존 main CI42757062609 live 성공: 실제 HTTPS 릴리스0.6.0·health·입구·익명 경로/틀린 암호/Origin 차단. Codex 직접 HTTPS는 CONNECT403. 외부 두 계정/WSS101/재배포 보존 미완료        |
| 네트워크 제한            | 도메인 허용 요청 후에도 현재 인스턴스는 allowed_hosts=[] / restricted / enforced. 현재 환경 반영 또는 새 환경 필요                                                                  |
| 화면 / 성능              | 기존5해상도·접근성·노트북/모바일 CPU4배 감속 검사 통과. 새 로컬 증거 `docs/v05/release-check/`; 실물 기기 인증 아님                                                                 |
| 원격 자원                | 최근1시간 메모리 약0.08675GB·제한 약1GB, 디스크 지표 약0.03382GB. 단일 관측이며 Volume 사용률/부하 보증 아님                                                                        |
| AI                       | OpenAI 키/모델 변수 없음·실제 호출 미실행. 기본 비활성. 연결 시 학교 하루3회/동시1개부터 시작                                                                                       |
| 비용 / 백업              | 기존 리소스 유지·플랜 상향 없음. 실제 청구/잔액·지출 경보·외부 백업 스케줄 미확인/미설정                                                                                            |
| 공개 운영                | 이메일 검증/복구/MFA·외부 인수 미완료. 공개 운영 보류                                                                                                                               |

[V05_RAILWAY_REPORT.md](V05_RAILWAY_REPORT.md)에 실제 ID·검증 결과·남은 설정·Git/CI를 기록합니다. [Railway 운영 지침](deploy/railway/README.md) · [기존 Compose](deploy/README.md).

## MASTER 로그인 인계 — 완료

PR #9/main `67f84b5`, CI109개 성공. 사용자 승인 후 실제 복구 배포 `9e6e1f3c-dc8b-4f02-a061-63b57dfc7b12`에서 계정 인계·검증 백업이 적용됐습니다. 최종 배포 `fb44aa92-27bc-411d-83ad-8954010861cc`는 SUCCESS이며 공용 암호 일치와 비밀번호 미재변경을 확인했습니다. 같은 영구 Volume을 유지하고 일반 시작 명령을 복원했습니다. 두 비밀은 실제 sealed이며 대기 변경은 없습니다.

접속 정보는 Git 밖 개인용0600 파일로 전달하며 실제 이메일·비밀번호·공용 암호는 Git/로그에 기록하지 않습니다. 외부 브라우저 두 계정/WSS 전체 인수와 외부 백업·비용 경보는 남아 있습니다. [MASTER_HANDOFF.md](MASTER_HANDOFF.md)에 실제 적용과 검증 범위를 기록합니다.

## 2026-11-10 이력: 캐릭터 스튜디오·교실·MASTER 이름 설정

- [PR #10](https://github.com/dhdh09080/pixel-class/pull/10): head `c6ec00c3a25c2650bad9ea99d2184667a4f846e9`, main merge `6493895ba7a20f5e43846b29e4887a55769319ce`. [CI42781869277](https://github.com/dhdh09080/pixel-class/actions/runs/42781869277) SUCCESS: 서버76 + 브라우저40 + 운영2 = 118. 기존109개 검증 조건 유지.
- 96×128 상세 레이어, 드롭다운 없는 외모 카드/색상, 모자/패턴/정장/드레스/티셔츠 등 의상, 4방향 미리보기. 교실은1120px/1배 텍스처에 미세 목재·가구·키보드·창문 디테일을 추가했습니다.
- 교실 방향키의 페이지 스크롤과 모바일 하단 메뉴에 가리던 이동 패드를 수정했습니다. 실제 키보드·포인터·hit-test로 검사했습니다.
- 기본 이름 **다희의 AI 교실**. MASTER는 **교실 제목 옆 연필 → 학교와 교실 이름** 또는 **⚙ 내 계정과 운영**에서 학교·기수·교실·학기를 저장합니다. 학생은 변경 불가, 다른 학교 격리, 새로고침·재시작 보존 검증 완료.
- 실제 실행은 위 표의 기존 `67f84b5`/`fb44aa92…` 그대로입니다. 대기 patch `94f0b81b-cc4b-4d2a-b863-c40682e872b9`는 **Commit Sha `67f84b5` → `6493895` 한 필드만 변경**, destructive:false. 계정·DB·Volume·sealed 비밀·일반 시작 명령 `node scripts/start.mjs`는 변경하지 않았습니다.
- Railway `accept_deploy`가 **“Cancelled — the user did not approve this action. No changes were made.”**로 거절했습니다. 다른 배포 경로로 우회하지 않았습니다. 사용자는 [Railway 프로젝트](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)의 **private-test → Review/Deploy**에서 이 소스 변경1건을 적용해야 합니다. 배포 SUCCESS 후 새로고침하면 새 UI를 확인할 수 있습니다. 현재 반영 완료로 보고하지 않습니다.
- Codex 직접 HTTPS는 이번에도 CONNECT403/HTTP000으로 차단됐습니다. 로컬 두 계정·HTTPS/WSS 검증과 외부 실제 인수는 구분합니다. [변경 보고서/화면 비교](CHARACTER_STUDIO_REPORT.md).

## 2026-11-11 둥근 캐릭터 최종 검증

[PR #11](https://github.com/dhdh09080/pixel-class/pull/11), head5fa213f / main merge58f2de9. [CI42990499455](https://github.com/dhdh09080/pixel-class/actions/runs/42990499455)는 서버76·브라우저40·운영2 = 118개 성공입니다. 기존 검사 조건을 유지하고 뒷머리에 얼굴색이 새지 않는 재현 검사를 추가했습니다. 로컬 최종 브라우저40개도 성공(4.5분), 모든 카탈로그의 선택/저장과4방향·앉기·30명·5해상도·접근성·감속 검사 포함입니다.

대기 patch94f0b81b…는 서비스1개의 소스를58f2de9로 갱신했습니다. 표시4필드 중 repo/branch는 같은 값, image는 빈 값이며 commitSha만 실제 변경됩니다. destructive:false, 변수/Volume/시작 명령 변경 없음. 실제 활성 배포는 fb44aa92…/67f84b5 그대로입니다. 이전 accept_deploy의 미승인 거절을 우회하지 않았으며 실제 적용은 Railway Review/Deploy 대기입니다. [전후 화면·증거](ROUND_CHARACTER_REPORT.md).

## 미세 도트 아트 최종 확인

[PR #12](https://github.com/dhdh09080/pixel-class/pull/12) / source4a647ca / main mergecb36f61. [최종 CI43103896234](https://github.com/dhdh09080/pixel-class/actions/runs/43103896234): 서버76 + 브라우저42 + 운영2 = **120개 성공**. 기존118개 조건 유지, 프리셋 저장/취소·피부/체형 보존 및 실제 미세 픽셀 검사2개 추가. 네 방향·앉기·30명·텍스처 폐기·5해상도·감속·접근성 검사 포함입니다. 추천 색상표 불일치는 재현 실패 후 수정했고 실제 선택 표시를 검사했습니다.

배포 대기는 cb36f61로 갱신했습니다. 표시4필드 중 commitSha만 실제 값이 바뀌며 destructive:false, 변수/Volume/시작 명령/DB/계정 변경 없음. 실제 활성 배포 fb44aa92…/67f84b5는 그대로 Online/1 running입니다. 이전 배포 도구의 미승인 차단을 우회하지 않았고 새 버전 실제 반영은 Review/Deploy 대기입니다. [실제 이미지·검증·한계](FINE_PIXEL_ART_REPORT.md).

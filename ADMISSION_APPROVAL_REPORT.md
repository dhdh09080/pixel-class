# 가입 승인 및 반 배정

2026-11-13 13:10 KST 운영 적용 완료. 기존 계정, SQLite 데이터, 캐릭터와 교실 디자인을 보존하는 가입 절차 변경입니다.

학생 가입 주소: https://pixel-class-private-test.up.railway.app/join

## 사용 방법

1. 학생은 학교 주소의 `/join`에서 **회원가입 신청 → 이메일·비밀번호 설정 → 다음 화면에서 이름·캐릭터 선택 → 가입 신청 보내기**로 진행합니다. 초대 코드나 공용 접근 암호를 입력하지 않습니다. 단계형 화면의 최신 배포·비교 결과는 [SIGNUP_UX_REPORT.md](SIGNUP_UX_REPORT.md)에 있습니다.
2. 신청자는 승인 대기 화면에서 상태를 확인합니다. 15초마다 확인하며 새로고침·재로그인해도 신청이 유지됩니다.
3. MASTER는 교무실 → 가입 승인에서 신청자의 이름과 이메일을 확인합니다. 기존 반을 선택하거나 새 반을 만든 뒤 **승인하고 반 배정**을 누릅니다.
4. 승인과 반 배정, 책상 배정, 학적 이력은 하나의 SQLite 트랜잭션으로 저장됩니다. 학생은 승인된 반을 확인하고 교실에 입장합니다.
5. 거절할 때는 학생에게 보이는 사유가 필요합니다. 거절한 신청도 새 revision으로 재검토할 수 있습니다.
6. 기존 학생과 MASTER는 기존 계정으로 로그인합니다. 기존 반이 없는 학생은 종전처럼 기본반을 사용합니다. MASTER 초기 설정 입구는 `/admin-entry`입니다.

반은 기존 경진대회·학생 반 데이터 모델을 재사용합니다. 이 변경에서 반별로 별개의 물리적 게임 월드를 만들지는 않습니다. 기존 MASTER의 반 이동과 학생 반 변경 기능도 유지합니다.

## 접근 및 보존

- 새 계정의 역할은 서버가 STUDENT로 고정하고 학적을 PENDING으로 생성합니다. role·status·schoolId·classId·초대 KEY 삽입 요청은 거부합니다.
- PENDING·REJECTED 계정에는 반과 책상이 없고 학교 state·자료·프로젝트·WSS 접근을 허용하지 않습니다.
- 공개 예외는 정확히 지정한 가입·로그인·본인 상태·입장·로그아웃·단일 복구 경로뿐입니다. 다른 API와 정적 학교 경로의 비공개 검증은 유지합니다.
- 공개 POST에는 학교의 정확한 Origin과 CSRF 헤더가 필요합니다. JSON은 16KB로 제한하고 IP·계정 로그인·학교의 가입량을 제한합니다. 학교당 하루 100건, 대기 200건이 한도입니다.
- 승인 전에 공용 접근 쿠키를 주지 않습니다. 승인 후 정상 세션으로 입장하거나 로그인하면 서명된 HttpOnly Secure 접근 쿠키를 발급합니다.
- 신청 이메일은 같은 학교 MASTER만 확인합니다. 학생 회원 목록에는 대기·거절 신청자를 넣지 않습니다.
- 다른 학교의 신청·반은 승인할 수 없습니다. 기존 학적 PATCH로 최초 가입 승인을 우회할 수 없습니다. 중복·경합 승인은 409로 거부하며 책상을 중복 배정하지 않습니다.
- 공개 가입 모드에서는 기존 초대 KEY 가입·발급 API를 410으로 중지합니다. 이미 등록된 학생은 영향을 받지 않습니다.
- 기존 서버 전용 비밀과 영구 볼륨은 유지합니다. 스키마 삭제·DB 초기화·운영 테스트 계정 생성은 하지 않습니다.

## 활성화와 롤백

`APPROVAL_REGISTRATION_ENABLED=true`를 Railway의 기존 서비스에 설정하면 공개 가입 및 승인 모드를 켭니다. 기본값 false는 기존 초대 방식입니다. 다른 변수는 바꾸지 않습니다.

문제가 생기면 이 변수를 false로 돌려 신규 공개 가입을 닫을 수 있습니다. 이미 생성된 대기 계정의 권한은 계속 차단됩니다. 기존 계정·신청 데이터·승인·반·프로젝트를 삭제하지 않습니다. MASTER의 가입 승인 API는 기존 신청을 안전하게 마무리할 수 있도록 유지됩니다.

이메일 소유권 확인, MFA, 자체 이메일 비밀번호 재설정은 이번 변경에 포함하지 않습니다. 기존 MASTER 발급 일회용 30분 복구 링크를 유지하며 공개 가입 화면에서도 사용할 수 있습니다. 신청자의 실제 소속은 MASTER가 승인 전에 확인해야 합니다.

## 검증 상태

[PR #16](https://github.com/dhdh09080/pixel-class/pull/16)을 main에 병합했습니다. 실제 배포 커밋은 `0cf6a0763f830e3dd876f62b96de352112b0a70e`이며, Railway 배포 `a018a284-249b-4920-ba68-56a7a9f8db3b`가 13:10:12 KST에 SUCCESS입니다. 배포 브랜치는 기존 `deploy/railway-verified`를 유지합니다.

- [PR 최종 CI](https://github.com/dhdh09080/pixel-class/actions/runs/43361177889) 및 [main CI](https://github.com/dhdh09080/pixel-class/actions/runs/43362379799): 서버144·브라우저51·Docker HTTPS 운영3 = **198개 통과, 실패0**. 기존190개에 서버 회귀7개와 가입 운영 시나리오1개를 추가했습니다.
- [실제 배포 외부 검사](https://github.com/dhdh09080/pixel-class/actions/runs/43363744235): 정확한 커밋의 HTTPS health, 공개 가입 모드 true, `/` → `/join`, 가입 HTML200, 잘못된 가입 요청400, 미로그인 신청 상태401, 익명 학교 API·WSS401, Origin 및 복구 링크 검사가 통과했습니다.
- `APPROVAL_REGISTRATION_ENABLED=true` 한 개만 기존 서비스에 추가했습니다. 중간 재배포를 건너뛰고 검증 브랜치 자동 배포에서 적용했습니다. 기존17개 변수·단일 sfo 인스턴스·500MB `/app/data` 볼륨·도메인·요금제를 유지합니다. 새 키·유료 리소스·DB 초기화는 없습니다.
- 최초 두 계정 가입·승인·반·WSS101·프로젝트·재시작 검사는 격리된 Railway Docker HTTPS 프로필에서 수행했습니다. **운영의 실제 MASTER 계정 로그인·인증 WSS101을 새로 시험한 것은 아닙니다.** 운영 DB에 QA 계정을 생성하지 않았습니다.

검증 명령:

- `npm run format:check`
- `npm test`: 기존 서버 검사와 신규 승인·반 배정·소유권·재시작 회귀
- `npm run test:e2e`: 기존 브라우저 회귀
- `npm run test:operations`, `npm run test:railway`: 기존 HTTPS 운영 프로필
- `npm run test:enrollment`: 별도 Docker/Railway HTTPS 환경에서 실제 MASTER·STUDENT 브라우저 세션, 코드 없는 가입, 승인 대기 API/WSS 차단, 반 생성/승인, 인증 WSS 2개, 프로젝트 저장, 서버 재시작, 모바일·노트북 캡처
- `scripts/check-live.mjs`: 실제 배포의 공개 가입 shell·익명 학교 API 차단·잘못된 입력 거부·WSS 익명 차단. 운영 DB에는 계정을 생성하지 않습니다.

main CI의 `playwright-report` artifact에서 아래 증거를 회수해 저장했습니다. 대기·승인 화면의 모바일/노트북 캡처를 직접 확인했으며, 대기 화면은 자동 WCAG A/AA 검사도 통과했습니다. 자동 테스트는 실제 사용성을 모두 보장하지 않습니다.

- [노트북 대기 화면](docs/admissions/qa/waiting-1366.png), [모바일 대기 화면](docs/admissions/qa/waiting-390.png)
- [노트북 가입 승인](docs/admissions/qa/master-approval-1366.png), [모바일 가입 승인](docs/admissions/qa/master-approval-390.png)
- [격리 HTTPS 결과](docs/admissions/qa/result.json), [실제 배포 기록](docs/admissions/release-check.json)

캡처는 운영 사용자 화면이 아니라 테스트 계정과 테스트 반으로 실행한 격리 환경입니다. 모바일 승인 목록은 기존 교무실 요약 아래에 있어 스크롤이 필요합니다. 반별 물리 교실 분리, 이메일 인증·MFA, 신청자에게 보내는 승인 이메일은 이번 범위에 포함하지 않습니다.

# 배포 적용 확인과 무료 운영 검토

2026-11-12 UTC. 사용자 dashboard Deploy 이후 확인한 후속 기록이다.

## 실제 적용과 검증 범위

- URL: https://pixel-class-private-test.up.railway.app/
- 실제 source: `ad4d62f032f6636a476f20b6e8429d741fbd68af`.
- 배포 `152e403f-7cb4-4a98-8732-6b76ce6217a0`, SUCCESS·Online·1 running·대기 변경 없음.
- 기존500MB school-data `/app/data`, 기존17개 변수·시작 명령 유지. 로그에서 Volume 연결·PRIVATE SCHOOL 서버 준비 확인.
- [플랫폼 기록](docs/production/live/platform-deployment.json). 현재 원격 DB 파일/백업 무결성을 직접 검사한 것은 아니다.
- 실제 외부 로그인과 WSS는 **미검증**이다. 현재 환경 관측 정책은 enforced·allowed_hosts=[]이며 목적지 호스트를 포함하지 않는다. 기본 HTTPS 프록시의 CONNECT403, 같은 프록시를 사용하는 실제 Chromium의 ERR_TUNNEL_CONNECTION_FAILED를 확인했다. [브라우저 기록](docs/production/live/browser-reachability.json).
- 연결된 로컬 브라우저 제어 도구가 없고 Cloud 브라우저도 sandbox 초기화 오류로 실행하지 못했다. 비밀번호·쿠키를 외부 도구에 전송하거나 프록시를 우회하지 않았다. 실제 계정 로그인을 성공으로 보고하지 않는다.
- 현재 Codex 환경의 허용 도메인에 해당 호스트를 추가하고 실행 환경에 적용한 후, MASTER·STUDENT 독립 세션과 WSS101·접속자·재연결을 검사해야 한다. 비밀은 채팅으로 요청하지 않는다.

후속: Codex와 별도인 기존 GitHub CI에서 비밀정보 없이 실제 HTTPS·공개 대회 페이지·익명 로그인/API/WSS 차단을 검사해 성공했다. [CI43250333509](https://github.com/dhdh09080/pixel-class/actions/runs/43250333509), [검증 범위](docs/production/live/external-ci.json). 정상 계정 로그인·WSS101 검증은 여전히 미완료다.

## Railway 비용

스크린샷의28일/$4.93는 잔여 체험 기간/크레딧이며 청구액이 아니다. 공식 문서상 Trial은 최대30일 또는 일회성$5 크레딧 소진까지다. 이후 Free는 월$1의 이월되지 않는 크레딧을 제공한다. 이것이 현재 학교의24시간 무료 운영을 보장하지는 않는다.

Hobby는 월$5이며 $5 사용량이 포함되고 초과분은 별도다. 본 작업에서 구독 변경·결제·새 리소스 생성을 하지 않았다. 실제 카드 등록·청구 내역·향후 비용은 확인하지 않았다. 크레딧 만료 전 외부 백업을 보관해야 하며, 공식 문서의 Free/Trial 만료 후 Volume 보존 기간도 확인한다.

출처: [Trial](https://docs.railway.com/pricing/free-trial), [플랜과 비용](https://docs.railway.com/pricing/plans).

## Vercel 무료로 그대로 옮길 수 있는가

현재 앱을 Vercel Hobby 하나로 그대로 옮기는 방식은 적합하지 않다.

1. Hobby는 개인·비상업 용도 제한이 있다. 회사 내부 교육 용도로 자동 적합하다고 판단하지 말고 약관/공급자 확인이 필요하다.
2. 현재 SQLite·첨부파일·백업은 영구 Volume을 사용한다. Vercel Functions의 임시 파일시스템을 대체 영구 DB로 쓰면 안 된다. 외부 DB와 파일 저장소로 이전하고 기존 데이터·인증·권한·복원을 검증해야 한다.
3. 최신 Vercel Functions는 WebSocket을 지원한다. 다만 함수 실행 시간에 따라 연결이 종료되고 재연결은 다른 인스턴스로 갈 수 있어 현재 프로세스 메모리의 접속자/방/브로드캐스트 구조를 외부 공유 저장소로 옮겨야 한다. WebSocket 자체가 불가능하다는 설명은 하지 않는다.
4. 프런트만 무료 호스팅하고 Railway API/WSS를 유지하면 Railway 비용은 남고 쿠키·출처·배포 관리가 복잡해진다.

출처: [Hobby 제한](https://vercel.com/docs/plans/hobby), [SQLite](https://vercel.com/kb/guide/is-sqlite-supported-in-vercel), [WebSocket 연결과 재연결](https://vercel.com/docs/functions/websockets).

## 현재 권고

현재 배포를 보존한 채 체험 크레딧으로 운영 인수를 마친다. 그 후 Free의 실제 사용량으로 요구 운영 시간을 감당할 수 있는지 확인한다. 유료 전환은 자동으로 진행하지 않는다.

호스팅 구독료0원이 필수라면 회사에서 허용한 기존 PC/서버의 Docker 운영도 검토할 수 있다. 인터넷 HTTPS/접속 허용·백업·전원·유지보수 비용과 담당자가 필요하다. 클라우드 무료 계층 조합으로 재설계할 수도 있으나 사용 조건·쿼터·휴면·파일·실시간 한도와 이관 비용을 검증하기 전에는 영구 무료를 보장하지 않는다. 이번 요청만으로 기존 DB 이전이나 Railway 해지/삭제를 실행하지 않았다.

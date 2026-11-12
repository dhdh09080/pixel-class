# 반별 AI 경진대회 아키텍처

기존 Express·SQLite WAL·WebSocket·계정·프로젝트 구조 위에 추가한다. 새 Supabase·서비스·공개 DB·새 유료 리소스는 만들지 않았다. 기존 계정/책상/외모 숫자 ID는 유지한다.

## 저장 구조

`records`에 학교별 `competition-class`, `competition`, `competition-entry`, `competition-version`, `competition-final-entry`, `competition-freeze`, `competition-file`, `competition-extension`, `competition-audit`, 알림 중복 방지 레코드를 저장한다. 원본 파일은 기존 학교 합산120MiB 한도에 포함한다. 정확한 레코드 종류와 DTO는 `server/competitions.ts`, `shared/competitions.ts`가 기준이다.

추가 SQLite 테이블:

- `competition_judge_passes`: 학교·대회·허용 작품·라벨·KEY SHA-256 해시·만료·사용/철회 상태. 원문 KEY는 발급 직후 한 번만 반환한다.
- `competition_judge_sessions`: 난수 토큰 해시·대회·학교·심사자·만료. 일반 학교 세션과 독립이다.
- `competition_scores`: 4개 점수·서버 총점·의견·요청 해시·idempotency KEY. `(competition_id, judge_id, entry_id)`와 `(competition_id, judge_id, idempotency_key)` UNIQUE 제약.

기존 사용자에 classId가 없으면 기존 학교의 기본반으로 해석한다. 학생 반 배정과 대회 참가자를 서버가 검증한다. MASTER는 자기 학교만, 학생은 자기 반의 배정 대회만 조회한다. **기존 교실·프로젝트의 일반 학교 범위를 새 반 시스템으로 자동 분리하는 것은 아니다.** 반 구분은 대회·이벤트·심사 자료에 적용한다.

## 시간과 제출

UI는 Asia/Seoul로 표시/입력하고 명시적인 `+09:00` 변환으로 UTC ISO 시각을 저장한다. 서버가 상태와 마감을 계산한다. 클라이언트의 상태·총점·계정/학교 ID를 권한 근거로 신뢰하지 않는다. 게시 전 초안, 게시 취소, 보관, 결과 공개/회수를 구분하고 처리 이력을 보존한다.

학생 제출은 자기 프로젝트와 명시적으로 제출한 결과물·소개서로 구성한다. 프로젝트의 공개용 부분만 스냅샷으로 남기며 개발 기록·이메일·AI 대화·MASTER 비공개 피드백을 심사자에게 전달하지 않는다. 저장 버전/동시 수정 revision을 확인한다. 최종 제출에는 공개 범위에 대한 동의가 필요하다. 심사 시작 시 제출물을 원자적으로 동결하고 이후 프로젝트 수정으로 출품작을 바꾸지 않는다. 개별 연장은 심사 시작 전만 가능하며 학생에게 자기 연장 정보만 반환한다.

## 외부 심사 경계

`/competition/<UUID>#judge=<KEY>` 링크는 KEY를 fragment에 둔다. UI는 활성화 요청 전에 주소에서 제거한다. HttpOnly/SameSite Strict/Secure 심사 쿠키는 대회별로 독립하고 일반 계정 세션을 만들지 않는다. 한 KEY는 원자적인 한 번의 세션 활성화만 허용하지만, 그 심사자는 지정된 여러 작품을 각각 한 번 평가할 수 있다. 만료·철회·허용 작품을 파일과 점수 요청마다 다시 확인한다.

Railway 비공개 게이트의 예외는 정확한 `/competition/<UUID>`, `/competition-assets/<허용 파일명>`, 해당 공개 대회 API만이다. `/assets`, `/api/config`, `/api/state`, 학교 파일·WebSocket은 그대로 보호한다. 공개 번들은 정적 코드일 뿐 계정 데이터가 아니다. production의 HTML/JS/CSS 경로를 별도 prefix로 재작성해 지연 로딩도 게이트를 우회하지 않고 동작하게 한다.

기본 공개 범위는 초대된 심사자만이다. PUBLIC 전시는 학생의 동의가 있는 출품작만 보여준다. 공개 DTO는 허용 필드 목록으로 생성하며 일반 학교 쿠키를 권한 확대에 사용하지 않는다. IP 제한은 남용 완화 수단이고 사람당 한 번의 심사를 보장하는 신원 확인으로 설명하지 않는다. 같은 학교 공용 IP의 정상 심사자30명 활성화도 회귀 검사한다.

## HTML와 파일

업로드 원본 HTML과 표시용 HTML을 분리한다. 서버의 `sanitize-html` 파서 허용 목록은 스크립트·외부 URL·이벤트 속성·스타일·iframe·폼 등을 제거한다. 미리보기는 `sandbox=""`의 opaque-origin iframe과 `default-src 'none'` CSP로 재차 격리한다. 원본은 권한 확인 후 `attachment`, `application/octet-stream`, `nosniff`, `no-store`로만 내려받는다. 원본 HTML을 웹페이지로 직접 실행하지 않는다.

각 파일5MiB, 허용 확장자·실제 시그니처·학교 저장/디스크 여유를 검사한다. ZIP/EXE는 설정에서 명시적으로 허용된 결과물만 저장·다운로드하며 서버에서 압축 해제/실행하지 않는다. 원격 결과 URL을 서버가 가져오지 않는다. 파일의 MIME은 제출자가 보낸 값을 신뢰하지 않는다.

## 점수와 결과

실용성35·활용성30·완성도20·창의성15, 정수·각 상한·합계100을 서버에서 검사한다. 점수는 최종 제출 후 변경 불가하다. 같은 idempotency KEY와 같은 내용의 재요청만 안전하게 재반환하고 다른 중복은409로 차단한다. DB 제약과 트랜잭션이 동시 요청을 보호한다.

순위는 합계가 아닌 유효 심사자의 **평균**으로 계산한다. 표시용 반올림 전 정수 분수(BigInt 교차 곱)를 비교한다. 동점은 총 평균→4개 항목 순서, 모두 같으면 공동 순위다. 최소 심사 수에 미달하면 순위/상을 부여하지 않는다. MASTER만 사전 집계를 보고, 학생/공개 페이지는 명시적인 결과 공개 후에만 집계를 받는다. 개별 심사 의견의 별도 공개 UI는 제공하지 않는다.

## 운영과 롤백

단일 인스턴스 전제다. 60초 서버 알림은 저장된 중복 방지 표식과 실제 학생의 학교/반/학적을 확인한다. 교실은 자기 반의 대회 하나만 선택해 표시하며 충돌 지형은 바꾸지 않는다. 행사 종료/보관 시 오브젝트를 제거한다.

기존 서버 자동 백업·학교 다운로드는 새 점수를 학교별로 보존하고 심사 KEY/세션을 제외한다. 복원 시 심사 세션도 무효화한다. 운영자 CLI의 원시 DB 백업은 비밀 자료로 취급한다. 새 테이블은 추가 방식이며 이전 앱 롤백은 데이터를 삭제하지 않고 무시한다. 롤백 전에 새 DB를 별도 일관성 백업으로 보존하고, 실행 중인 WAL 파일을 단독 복사하지 않는다.

원격 배포와 실제 학교 DB 검증 상태는 `STATUS.md`와 `PRODUCTION_FINAL_REPORT.md`가 기준이다.

# Production improvements

코드 기준 `feature/pixel-class-production-quality`. 기존 사용자·DB·Volume·비밀 변수는 변경하지 않았다. 구현 상태와 실제 배포 상태는 별개다.

| 변경                   | 이전 문제                                                      | 결과 / 근거                                                                       | 주요 파일                                                                   |
| ---------------------- | -------------------------------------------------------------- | --------------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| 반별 경진대회          | 대회·독립 심사 흐름 없음                                       | 반/대회/참가자·KST 일정·서버 상태·명시적 결과 공개                                | `server/competitions.ts`, `shared/competitions.ts`, `src/Competitions.tsx`  |
| 제출과 버전 고정       | 일반 프로젝트 수정이 심사 대상에 영향을 줄 수 있음             | 소유권/revision/동의 검사·수정 버전 보존·심사 시작 시 최종 목록 동결              | `server/competitions.ts`                                                    |
| 외부 심사              | 학교 계정을 주거나 공개 범위를 넓혀야 하는 위험                | 해시 KEY의 원자적1회 활성화·대회별 독립 쿠키·작품별1회 평가·DB UNIQUE·idempotency | `server/competitions.ts`, `src/PublicCompetition.tsx`                       |
| 안전한 소개서          | 업로드 HTML 실행 위험                                          | 파서 허용 목록·속성/URL 제거·opaque iframe/CSP·원본 attachment 권한               | `server/competition-domain.ts`, `src/competition-ui.tsx`                    |
| 심사 집계              | 심사 수가 많으면 합계가 유리하거나 반올림 동점 오류            | 평균·정수 분수 비교·항목별 동점 해소·공동 순위·최소 심사 수                       | `server/competition-domain.ts`                                              |
| 동의와 권한 강화       | API로 동의 우회, 공개 범위 밖 원본 열람, 이후 실명/PUBLIC 확대 | 서버 최종 동의·원본 scope·동의 당시 공개 범위를 다시 검사                         | 신규 경진대회 회귀 테스트                                                   |
| 학급/복원 보안         | 반 이동 후 이전 반 알림, 과거 백업의 미사용 KEY 부활           | 현재 반 알림 검사·복원 시 KEY/심사 세션 무효화·계정/점수 보존                     | `server/competitions.ts`, `scripts/database.mjs`                            |
| 학교 공용 IP           | 낮은 KEY 시도 제한이 정상 심사자도 차단                        | 남용 제한 유지하면서 같은 NAT30명 활성화 검증                                     | `tests/competitions.test.ts`                                                |
| 저해상도 레이어 아바타 | 192×256 미세선 표현이 새 아트 요구와 불일치                    | 60×80 정수 도트·1px 외곽·불투명16~19색 추천 코디·코/목 생략·큰 홍채               | `src/game/character.ts`, `pixelArt.ts`, `playerHair.ts`, `playerClothes.ts` |
| 자유로운 직업 코디     | 의상8종, 직업 조합 부재                                        | 의상25·모자15·헤어18·눈10·피부8·눈 색12·직업17코디, 성별 제한 없음                | `shared/appearance.ts`, `src/CharacterEditor.tsx`                           |
| 외모 데이터 보존       | 확장 시 과거 옵션/책상 크기 손상 위험                          | 기존 숫자 ID 유지,55.2×73.6 월드 크기 유지, 직업 변경은 얼굴·머리·피부 보존       | 캐릭터 API·브라우저 회귀                                                    |
| 노트북 메뉴            | MASTER 1280×720에서 하단 안내/아바타가 화면 밖으로 밀림        | 짧은 화면 메뉴 간격 조정·내부 스크롤·하단 고정, 포레스트 톤 복구                  | `src/design-system.css`, `tests/navigation.spec.ts`                         |
| 심사 모바일 UX         | 긴 일정+큰 빈 미리보기 때문에 평가까지 스크롤 과다             | 선택 작품의 짧은 헤더·접는 일정·미리보기 확대·평가 바로가기·4항목 평균            | `src/PublicCompetition.tsx`, `src/competition.css`                          |
| 교실 행사              | 반별 행사 표시 없음, 책상/캐릭터 이름 중복                     | 자기 반 배너·게시판·트로피·상태 갱신, 책상 번호 표시, 충돌 지도 유지              | `src/game/scene.ts`, `competitionArt.ts`, `Classroom.tsx`                   |
| QA 지속성              | 오래된 드롭다운 soak 절차·과거 캡처 덮어쓰기                   | 실제 그림 카드 선택으로 수정, QA 출력 폴더 지정, 이전 아트 보고서 캡처 보존       | `scripts/soak.mjs`, `capture-design.mjs`, `load-realtime.mjs`               |
| 실제 운영 경계 검사    | Vite만으로 비공개 정적 자산 예외를 증명할 수 없음              | 실제 Docker Railway 프로필의 HTTPS/Volume/공개 지연 번들·학교API401 검사 추가     | `tests/operations.ops.ts`                                                   |

최초 시안에서 눈이 가늘게 보이는 문제를 캡처로 확인해 홍채·하이라이트를 조정했다. 전수 픽셀 비교에서 동일했던 눈 옵션과 파일럿/경찰 모자를 각각 수정했다. 검사를 약화하여 통과시키지 않았다. 이전192×256 원본 크기 검사는 새 사용자 아트 지시에 맞게60×80·고정 월드 크기·이진 알파·제한 팔레트 검사로 갱신했다.

사용하지 않는 이전 `hairArt.ts`/`garmentArt.ts`는 새 레이어 모듈로 교체했다. 저장 데이터 형식은 유지한다. 생성한 홍보/참고 이미지를 실제 앱 렌더링이라고 보고하지 않았다.

정적 JS/CSS의 원본 전송 때문에 감속 환경의 교실 진입이 약14초임을 확인했다. 인증 검사를 보존한 Brotli/gzip·표현별 ETag·동시 첫 요청 통합·64MiB 캐시를 추가해 노트북5.67초/모바일6.08초로 줄였다. 공개 심사 번들 변환과 캐시를 분리하고 HTML/API/학생 파일은 압축하지 않는다. 신규 HTTP8개와 두 Docker HTTPS 프로필로401/304 경계를 확인했다. 주요 파일은 `server/static-assets.ts`, `server/index.ts`, `tests/static-assets.test.ts`이며 [전후 측정](docs/production/performance-comparison.json)을 남겼다.

최종 실행 결과는 `PRODUCTION_TEST_REPORT.md`, 운영 차단 요인은 `PRODUCTION_FINAL_REPORT.md`를 확인한다.

# v0.3 디자인 변경 전후 비교

실제 Chromium 화면입니다. 기준/최종 각각 35장(5개 해상도×7개 화면)을 보관했습니다. `cycle-1`~`cycle-7`에는 전체 검사 측정값과 회차별 대표 스크린샷 4장을 보관했습니다. 중간 회차의 나머지 PNG는 저장소 크기를 줄이기 위해 제외했습니다. 전체 페이지 캡처는 세로로 스크롤되는 문서를 포함하며, 파일의 높이가 viewport 높이와 같다는 뜻은 아닙니다. 모달의 실제 화면 내 경계는 각 `measurements.json`에서 별도로 확인합니다.

[브라우저로 전후 비교 열기](docs/v03/comparison.html)

| 화면·해상도              | 이전                                                | 이후                                               |
| ------------------------ | --------------------------------------------------- | -------------------------------------------------- |
| 교실 · 1366x768          | [보기](docs/v03/before/classroom-1366x768.png)      | [보기](docs/v03/after/classroom-1366x768.png)      |
| 교실 · 390x844           | [보기](docs/v03/before/classroom-390x844.png)       | [보기](docs/v03/after/classroom-390x844.png)       |
| 프로젝트 목록 · 1366x768 | [보기](docs/v03/before/projects-1366x768.png)       | [보기](docs/v03/after/projects-1366x768.png)       |
| 프로젝트 목록 · 390x844  | [보기](docs/v03/before/projects-390x844.png)        | [보기](docs/v03/after/projects-390x844.png)        |
| 프로젝트 상세 · 1366x768 | [보기](docs/v03/before/project-detail-1366x768.png) | [보기](docs/v03/after/project-detail-1366x768.png) |
| 프로젝트 상세 · 390x844  | [보기](docs/v03/before/project-detail-390x844.png)  | [보기](docs/v03/after/project-detail-390x844.png)  |
| MASTER · 1366x768        | [보기](docs/v03/before/master-1366x768.png)         | [보기](docs/v03/after/master-1366x768.png)         |
| MASTER · 390x844         | [보기](docs/v03/before/master-390x844.png)          | [보기](docs/v03/after/master-390x844.png)          |
| 캐릭터 · 1366x768        | [보기](docs/v03/before/character-1366x768.png)      | [보기](docs/v03/after/character-1366x768.png)      |
| 캐릭터 · 390x844         | [보기](docs/v03/before/character-390x844.png)       | [보기](docs/v03/after/character-390x844.png)       |
| 자료실 · 1366x768        | [보기](docs/v03/before/materials-1366x768.png)      | [보기](docs/v03/after/materials-1366x768.png)      |
| 자료실 · 390x844         | [보기](docs/v03/before/materials-390x844.png)       | [보기](docs/v03/after/materials-390x844.png)       |
| 입학 · 1366x768          | [보기](docs/v03/before/admission-1366x768.png)      | [보기](docs/v03/after/admission-1366x768.png)      |
| 입학 · 390x844           | [보기](docs/v03/before/admission-390x844.png)       | [보기](docs/v03/after/admission-390x844.png)       |

## 실제 개선과 남은 문제

| 화면     | 개선                                                                                                             | 남은 문제                                                                                   |
| -------- | ---------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 교실     | 모바일 하단 메뉴·터치 이동·native 크기 캐릭터, 고정 하단 막대 제거, 가구 hover, 바닥 변형·그림자, 거리 기반 걷기 | 모바일은 카메라의 일부 월드만 보임. 밀집한 보조 이름표는 숨겨지며 전체 정보는 목록에서 확인 |
| 프로젝트 | 다음 단계·오늘 기록·선생님 질문·AI 안내를 한곳에 배치, 가독성·줄바꿈·메뉴 키보드 탐색                            | 상세 기능이 많아 초보 사용자와 실제 교육 현장 검증 필요                                     |
| MASTER   | 핵심 4지표, 상담 우선순위, 학생/학적 필터, 질문/검토 직접 이동                                                   | 많은 학생의 비교 화면과 상담 기록 밀도는 추가 사용자 조사 필요                              |
| 캐릭터   | 큰 미리보기·얼굴 그룹·선택 테두리·취소·busy                                                                      | 작은 화면에서 옵션을 스크롤해야 함. 전 방향 별도 전문 스프라이트 제작은 미완료              |
| 입학     | 짧은 단계 안내·읽기 쉬운 입력·화면 내 오류                                                                       | 이메일 확인·비밀번호 복구·MFA 미구현                                                        |
| 자료실   | 44px 모바일 검색, 검색 초기화, 형식/버전, TXT/MD 안전한 미리보기, 업로드 오류 유지                               | 문서 전용 뷰어·악성코드 검사 없음                                                           |

## 반복 검토 증거

| 회차 | 증거                                                                                                                                           | 발견/결정                                                        |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- |
| 1    | [측정값](docs/v03/cycle-1/measurements.json) · [교실](docs/v03/cycle-1/classroom-390x844.png) · [MASTER](docs/v03/cycle-1/master-1366x768.png) | 모바일 카메라·터치/모달/상담 우선순위 첫 적용                    |
| 2    | [측정값](docs/v03/cycle-2/measurements.json) · [교실](docs/v03/cycle-2/classroom-390x844.png) · [MASTER](docs/v03/cycle-2/master-1366x768.png) | 외모 그룹·취소/미리보기/픽셀 바닥·걷기 보완                      |
| 3    | [측정값](docs/v03/cycle-3/measurements.json) · [교실](docs/v03/cycle-3/classroom-390x844.png) · [MASTER](docs/v03/cycle-3/master-1366x768.png) | 7개 화면 전체 axe 범위 확대, 보조 글자 대비 부족 발견            |
| 4    | [측정값](docs/v03/cycle-4/measurements.json) · [교실](docs/v03/cycle-4/classroom-390x844.png) · [MASTER](docs/v03/cycle-4/master-1366x768.png) | 대비 재검사, 장식 문자·자료 수 보조 글자 수정                    |
| 5    | [측정값](docs/v03/cycle-5/measurements.json) · [교실](docs/v03/cycle-5/classroom-390x844.png) · [MASTER](docs/v03/cycle-5/master-1366x768.png) | 전체 화면 0위반 확인 후, 펼친 통계 hover·모바일 검색을 추가 검토 |
| 6    | [측정값](docs/v03/cycle-6/measurements.json) · [교실](docs/v03/cycle-6/classroom-390x844.png) · [MASTER](docs/v03/cycle-6/master-1366x768.png) | 입력 경계의 비텍스트 대비 1.35:1 재현, 3:1 이상·모바일 16px 보정 |
| 7    | [측정값](docs/v03/cycle-7/measurements.json) · [교실](docs/v03/cycle-7/classroom-390x844.png) · [MASTER](docs/v03/cycle-7/master-1366x768.png) | Canvas 안 3개 보조 글자 팔레트 대비를 별도 계산해 보정           |

최종 [측정값](docs/v03/after/measurements.json)에는 35개 화면의 문서 폭·모달 경계·JavaScript 오류·axe 위반과 수동 확인이 필요한 incomplete 규칙을 기록합니다. axe의 incomplete 항목을 통과로 계산하지 않습니다. [앉은 캐릭터 실제 Canvas](docs/v03/qa/seated-classroom.png)도 별도로 저장합니다. 자동 검사는 픽셀 Canvas 내부의 글자 대비/이름표를 인증하지 않습니다.

디자인 평점과 제품 평가 근거는 [V03_SCORECARD.md](V03_SCORECARD.md)를 확인하세요.

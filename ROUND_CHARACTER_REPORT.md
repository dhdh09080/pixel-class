# 둥근 캐릭터 아트 수정

> 후속 미세 도트 아트는192×256 원본과 재질 디테일/추천 코디로 갱신했습니다. 최신 구현·검사·배포 상태는 [FINE_PIXEL_ART_REPORT.md](FINE_PIXEL_ART_REPORT.md)를 우선합니다. 이 문서는 앞선 둥근 실루엣 작업 이력입니다.

2026-11-11 KST. 각진 얼굴·두꺼운 눈/안경·뾰족한 앞머리로 인상이 부담스럽다는 사용자 피드백을 반영했습니다. 새 꾸미기 기능을 늘리지 않고 렌더러의 인상과 실루엣을 수정했습니다.

## 실제 변경

- 둥근 큰 머리와 도톰한 볼, 작은 어깨·손·신발로 비율을 다듬었습니다. 얼굴의 사각 턱과 딱딱한 윤곽을 줄였습니다.
- 눈을 작고 부드럽게 그리고 반사광·테두리 대비를 줄였습니다. 안경은 얇고 둥근 테두리로 바꿨습니다. 눈썹·입·홍조도 같은 팔레트로 완화했습니다.
- 뾰족한 지그재그 앞머리를 둥근 가닥으로 바꾸고, 긴 머리 끝과 묶은 머리도 곡선으로 그립니다. 첫 검토에서 앞머리가 덩어리처럼 보여 모양을 다시 조정했습니다.
- 의상의 둥근 어깨·작은 소매·장갑 같은 손과 부드러운 명암을 적용했습니다. 드레스/정장/티셔츠 등 기존 의상과 모자 색상/패턴은 유지합니다. 안전모는 낮고 납작해 보이지 않도록 돔 비율을 추가 조정했습니다.
- 곡선은 정수 좌표의 픽셀 scanline으로 직접 그립니다. 흐리게 확대하거나 이미지에 blur를 적용하지 않았습니다. 원본96×128·월드 배율0.575·발 앵커·책상/충돌 좌표는 같습니다.
- 네 방향 시각 검토에서 뒷머리 곡선 아래로 얼굴색이 비치는 결함을 발견했습니다. 빨간 피부 fixture로 헤어10종의 뒷머리 영역에 피부가 새지 않는 최소 재현 검사를 먼저 추가해 실패를 확인한 뒤, 뒷모습에서는 얼굴/귀 레이어를 그리지 않도록 수정했습니다. 긴 뒷머리도 옷 위에 자연스럽게 내려오도록 정렬했습니다.
- API·DB·계정·저장 외모 값·학교 설정은 변경하지 않습니다. 같은 저장 옵션을 새 렌더러로 표시합니다. 교실과 편집 미리보기는 같은 생성기를 사용합니다.

## 화면 증거

| 비교                     | 경로                                                                                                                          |
| ------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| 기존 스튜디오 / 카탈로그 | [기존 화면](docs/round-characters/before-studio.png) · [기존 카탈로그](docs/round-characters/before-catalog.png)              |
| 새 스튜디오              | [데스크톱](docs/round-characters/after-desktop.png) · [모바일](docs/round-characters/after-mobile.png)                        |
| 새 얼굴 / 모자           | [얼굴](docs/round-characters/face-options.png) · [모자](docs/round-characters/headwear-options.png)                           |
| 새 캐릭터                | [미리보기](docs/round-characters/preview.png) · [카탈로그](docs/round-characters/sprite-catalog.png)                          |
| 실제 교실 크기           | [노트북](docs/round-characters/classroom-laptop-viewport.png) · [모바일](docs/round-characters/classroom-mobile-viewport.png) |

[네 방향 스프라이트 비교](docs/round-characters/directions.png)도 확인했습니다.

변경 전은 d122a05까지 보존된 실제 로컬 QA 캡처를 재사용했습니다. 변경 후는 이번 실제 Chromium 화면이며 별도 임시 DB의 합성 계정입니다. 미리보기의 “다희”는 QA 화면용 이름이며 운영 계정 이름을 변경하지 않았습니다. 캡처를 생성 이미지로 대체하지 않았습니다.

## 검사와 적용

로컬 서버76개·최종 브라우저40개(4.5분) 통과. 집중5개는 이40개에 포함되므로 중복 집계하지 않습니다. 새 뒷머리 재현 검사는 수정 전10종 모두 실패, 수정 후 모두0개 피부 픽셀로 통과했습니다. GitHub CI는 서버76 + 브라우저40(4.4분) + Compose1 + Railway 프로필1 = **118/118 성공**입니다. [실행 근거](docs/round-characters/test-results.json)와 [감속 기기 지표](docs/round-characters/device/)를 보존했습니다. 별도 탭 얼굴/체형/모자/의상·390px 모바일의 WCAG AA 자동 검사와 화면 오류는 docs/round-characters/manual-review.json에 보존합니다. 자동 검사는 미적 만족이나 실물 기기 검증을 대신하지 않습니다.

## Git / 배포 상태

[PR #11](https://github.com/dhdh09080/pixel-class/pull/11), source head `5fa213f78043a4a537f8ff0869ed0faf259e26c5`, main merge `58f2de94b79dddeb60577332e810e4c674226d3d`. [CI42990499455](https://github.com/dhdh09080/pixel-class/actions/runs/42990499455) SUCCESS 후 병합했습니다.

실제 Railway 실행은 아직 `67f84b5` / deployment `fb44aa92-27bc-411d-83ad-8954010861cc` SUCCESS입니다. 기존 대기 소스6493895를 **새 둥근 버전58f2de9**로 교체했습니다. patch `94f0b81b-cc4b-4d2a-b863-c40682e872b9`는 서비스1개를 업데이트하며 destructive:false입니다. 플랫폼에4개 필드가 표시되지만 repo와 branch는 동일 값, image는 빈 값이며 실제 값이 달라지는 것은 commitSha1개입니다. Volume·sealed 비밀·시작 명령·계정은 유지합니다.

이전 배포 적용 요청은 Railway 도구에서 **“Cancelled — the user did not approve this action. No changes were made.”**로 거절됐습니다. 이번에는 검증한 소스의 대기 대상만 갱신했으며, 승인 차단을 우회하거나 적용을 재시도하지 않았습니다. 실제 사이트 반영은 [Railway 프로젝트](https://railway.com/project/c46ee1d7-c441-4b23-a3f2-f1d349c9f504)의 private-test Review/Deploy 적용 대기입니다. 아직 배포 완료라고 보고하지 않습니다.

[작은 스프라이트 미리보기](docs/round-characters/avatar.png)는 실제 렌더러의2배 출력이며, 실제 UI 캡처는 위 after 화면을 참고합니다.

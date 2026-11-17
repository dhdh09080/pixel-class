# 얼굴 비율 보완 증거

- `before/`: 실제 작업 전8종·리그·PNG 해시·눈 기하 데이터(기준96680b7).
- `comparison.png`: 같은 외형 선택값으로 전후 얼굴2배·원본·교실 표시 크기를 비교한 실제 브라우저 캡처.
- `after/faces-eight.png`: 수정한 얼굴8종. `after/composed-*.png`는 투명 원본.
- `source/`: 새 얼굴/특징 원화와 컴파일 메타데이터. `rejected-single-eyes.png`는 채택하지 않은 시안이며 게임에서 사용하지 않습니다.
- `after/cycle-*`: 중간 검토 기록. 최종 합격 결과로 해석하지 않습니다.
- `qa/`: 648개 조합·피부색별 입 가독성 등 자동 검사 결과.
- `product/`: 합성 테스트 사용자로 캡처한5개 해상도의 실제 교실·꾸미기. 실제 학생 개인정보를 사용하지 않습니다.

상세: [FACE_PROPORTIONS_REPORT.md](../../FACE_PROPORTIONS_REPORT.md). 실행·배포 상태는 [STATUS.md](../../STATUS.md)의 최신 기록을 확인하세요.

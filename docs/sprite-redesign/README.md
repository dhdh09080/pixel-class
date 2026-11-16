# 캐릭터 아트 v2 증거 안내

- **최종 실제 합성**: [reviews/final-layers.png](reviews/final-layers.png). 8종 각각 120×160 원본·2배 확대·실제 후면입니다. 원본 개별 PNG는 `samples/composed-0..7.png`, `samples/rear-0..7.png`입니다.
- **실제 브라우저 비교**: `qa/gallery-*.png`, `qa/comparison-*.png`, `qa/studio-*.png`. 페이지 `/character-art`의 현재 합성기를 캡처했습니다.
- **제품 화면**: `product/classroom-*.png`, `product/studio-*.png` — 1920/1440/1366/1280/390px. 격리된 임시 DB의 합성 테스트 사용자만 사용했습니다. 운영 학생 화면이나 운영 계정 캡처가 아닙니다.
- **미적 검토 반복**: `reviews/cycle-1..5-layers.png`. 초기 정렬·피부·홍채·헤어 가림 문제를 숨기지 않도록 남긴 중간 결과이며 최종 결과로 사용하지 않습니다.
- **원화·아틀라스**: `source/`의 투명 PNG는 이미지 생성 도구로 제작한 독자적인 아트입니다. `source/art-direction-eight.png`, `eight-native-review.png` 및 `samples/0..7.png`는 최초 콘셉트 단계입니다. 실제 분리 합성 결과와 구분하세요.
- **수치 검사**: `qa/sample-diagnostics.json`, `qa/texture-workload.json`, `qa/eye-matrix.json`, `qa/expression-check.json`, `qa/office-laptop.json`, `qa/mobile.json`, `product/measurements.json`, `local-checks.json`. 표정6종 원본/2배는 `qa/expressions-6.png`입니다. 접근성·경계·홍채 위치·제한된 부하 검사는 미적 품질의 자동 보증이 아닙니다.

아트 정의/재생성: [CHARACTER_ART_SYSTEM.md](../../CHARACTER_ART_SYSTEM.md). 실제 검증·남은 문제·배포: [CHARACTER_ART_REDESIGN_REPORT.md](../../CHARACTER_ART_REDESIGN_REPORT.md).

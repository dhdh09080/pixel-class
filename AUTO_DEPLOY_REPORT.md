# Railway 자동 배포

2026-11-13 KST. 기존 SQLite·500MB Volume·17개 환경 변수·비공개 입구·단일 인스턴스를 보존합니다. 새 키·유료 리소스·요금제 변경 없이 GitHub Actions의 짧은 수명 GITHUB_TOKEN으로 배포 브랜치만 갱신합니다.

## 동작 순서

1. main에 정상 push/병합합니다. PR에서는 배포하지 않습니다.
2. 전체 서버·브라우저·두 Docker HTTPS 운영 프로필이 통과해야 publish가 실행됩니다.
3. 현재 main 커밋만 `deploy/railway-verified`로 정상 push합니다. 오래된 실행은 생략하고, 분기된 배포 이력은 강제로 덮어쓰지 않습니다.
4. Railway는 이 브랜치를 자동 배포합니다. Commit Sha 고정을 제거하며 별도 Railway “Wait for CI”는 사용하지 않습니다. 검증 완료 뒤에만 브랜치를 갱신하는 구조로 순환 대기를 방지합니다.
5. live 작업은 실제 HTTPS health의 `X-Pixel-Class-Commit`이 검증 커밋과 같아질 때까지 기다린 후 비공개 입구·익명 API/WSS 차단·공개 기능 자산을 검사합니다. 실제 계정 로그인·인증된 WSS 101은 포함하지 않습니다.

publish만 contents:write를 가지며 PR 검사와 live는 읽기 권한입니다. 새 비밀을 Git이나 로그에 기록하지 않습니다. 배포 브랜치에 수동으로 코드를 push하지 마세요. CI 자체가 실행되지 않거나 권한/테스트가 실패하면 자동 승격하지 않습니다. Railway 장애가 자동으로 해결되거나 DB가 자동 롤백되는 기능은 아닙니다.

## 이번 검증

- 로컬 `npm test`: 137/137 통과. 기존 133개에 실제 임시 Git 원격으로 생성/정상 갱신·오래된 실행·분기 이력·잘못된 SHA를 검사하는 4개를 추가했습니다.
- `npm run build`: 통과. health 헤더도 실제 테스트 서버에서 확인합니다.
- 이전 main `fb3bfcc`의 실패했던 외부 검사만 재실행한 CI43294492581은 이제 성공입니다. 기존 운영 개선 배포 `1dc05462-f8c3-4ddb-ab38-147ba3f4a29d`는 SUCCESS이며, 이는 새 자동 배포 파이프라인의 완료 증명과 구분합니다.
- [PR #15](https://github.com/dhdh09080/pixel-class/pull/15)를 `987df36bb52836382f4c9807b14f0f48bb69525a`로 main에 병합했습니다. [PR CI43313650237](https://github.com/dhdh09080/pixel-class/actions/runs/43313650237) 전체 190개가 통과했습니다.
- [main CI43315133977](https://github.com/dhdh09080/pixel-class/actions/runs/43315133977)에서도 서버137·브라우저51·운영2 = **190개 통과**, publish 성공을 확인했습니다. GitHub Actions가 실제 배포 브랜치를 `987df36`으로 정상 갱신했고 원격 ref도 일치합니다.
- 사용자가 최초 설정 두 건을 적용했습니다. 현재 source는 `deploy/railway-verified`이며 Commit Sha 고정과 대기 변경이 없습니다. 기존 Volume·17개 변수·단일 인스턴스를 유지합니다.
- [CI43317472507](https://github.com/dhdh09080/pixel-class/actions/runs/43317472507)은 **190개 verify·publish·live 모두 성공**입니다. 실제 HTTPS health의 커밋이 `f36f5d5afe702e7e658abb9f951764f1fd3ac50a`와 일치하고, 비공개 입구·익명 API/로그인/WSS 차단·공개 기능 파일을 확인했습니다. 정상 계정 로그인·인증된 WSS 101은 포함하지 않습니다.
- 현재 배포 `ceef1fd2-1727-4145-9d9c-1b4f881e803e`는 SUCCESS·Online·1 running입니다. [범위별 증거](docs/automation/state.json).

## 최초 설정 이후 자동 재배포 확인

초기 설정 적용은 완료됐습니다. 이 확인 기록을 main에 정상 push해 **190개 검사 → 배포 브랜치 자동 갱신 → Railway 후속 배포 → 정확한 커밋의 외부 인수**를 수동 Deploy 없이 추가 확인합니다. 이 후속 검사 완료 전에는 최초 설정 적용을 별도의 자동 재배포 이벤트 성공으로 계산하지 않습니다. 앞서 도구의 적용 승인이 거절된 기록은 당시 이력이며 현재 설정 대기를 의미하지 않습니다.

보고서 보완 커밋은 문서와 검증 자료만 포함하며 앱 런타임은 위 190개 검사의 커밋과 같습니다. 보완 커밋의 CI/배포 완료를 앞선 결과로 대신 표시하지 않습니다. 롤백은 main에 정상 revert 커밋을 만들고 다시 검증·배포합니다. DB를 자동으로 이전 시점으로 돌리거나 배포 이력을 강제로 덮어쓰지 않습니다.

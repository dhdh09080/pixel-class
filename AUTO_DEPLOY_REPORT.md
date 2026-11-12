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
- 새 파이프라인의 PR CI와 실제 자동 승격·배포는 검증 중입니다. 기존 51개 브라우저·두 운영 프로필을 유지합니다.

## 최초 설정 적용 상태

Railway 대기 patch `4ee79d9c-195b-4ebb-837c-9b77f6379385`는 **Branch main → deploy/railway-verified**, **Commit Sha 고정 해제** 두 항목뿐입니다. destructive:false이며 Volume·비밀·도메인을 바꾸지 않습니다. 최초 배포 브랜치는 전체 기존 CI/외부 검사가 통과한 `fb3bfcc`로 만들었습니다.

사용자의 요청 후 도구의 자동 승인 검토가 `accept_deploy`를 “Cancelled — the user did not approve this action. No changes were made.”로 거절했습니다. 브라우저 제어 연결도 실패했으므로 우회하지 않았습니다. 사용자가 열린 Railway **private-test → Review/Deploy**에서 이 두 설정을 최초 한 번 적용해야 합니다. 실제 적용 확인 전에는 자동 배포가 활성화됐다고 보고하지 않습니다.

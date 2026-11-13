# Railway 자동 배포

2026-11-13 KST. 기존 SQLite·500MB Volume·17개 환경 변수·비공개 입구·단일 인스턴스를 보존합니다. 새 키·유료 리소스·요금제 변경 없이 GitHub Actions의 짧은 수명 GITHUB_TOKEN으로 배포 브랜치만 갱신합니다.

## 최종 판정 — 무인 자동 배포 실제 완주

2026-11-13 09:50 KST 확인. 서비스 Source와 배포 환경 브랜치를 복구한 뒤 **main push → 190개 검사 → 검증 브랜치 자동 승격 → Railway 자동 배포 → 배포 완료 이벤트 외부 검사**가 별도 source/Deploy 호출 없이 모두 성공했습니다.

| 단계           | 실제 증거                                                                                                                                                                      |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 검증 커밋      | `63af1c4debfea671a2a97f8b65544c4c2f8af33a`                                                                                                                                     |
| 배포 전 CI     | [43338786895](https://github.com/dhdh09080/pixel-class/actions/runs/43338786895), 서버137·브라우저51·운영2 = 190개 및 publish 성공                                             |
| 자동 승격      | 09:47:53 KST, `deploy/railway-verified`를 같은 SHA로 정상 갱신                                                                                                                 |
| 자동 배포 시작 | 09:47:54 KST, 배포 `38dfd8ba-9f3d-4d50-8a48-abf487e92eef` 생성                                                                                                                 |
| 배포 완료      | 09:48:19 KST SUCCESS·Online·1 running                                                                                                                                          |
| 자동 외부 인수 | deployment_status로 실행된 [43339980903](https://github.com/dhdh09080/pixel-class/actions/runs/43339980903), 실제 HTTPS 커밋 일치·입구·익명 API/로그인/WSS 차단·공개 자산 성공 |
| Source 설정    | `dhdh09080/pixel-class` / `deploy/railway-verified`, 고정 커밋 없음·checkSuites:false. 사용자 화면의 Disable 버튼으로 Auto deploy 활성 확인                                    |

기존 500MB Volume·17개 변수·단일 인스턴스·계정·도메인·요금제를 유지했습니다. 정상 계정의 외부 로그인·인증된 WSS 101은 이번 인수에 포함하지 않습니다. 환경 조회에 변경 목록이 비어 있는 stage 메타데이터가 남아 있지만 실제 source 변경은 0건이며 자동 배포를 막지 않았습니다. 추가 사용자 설정은 필요하지 않습니다. [구조화된 증거](docs/automation/state.json).

최종 기록 커밋은 문서·관측만 포함하며 확인된 63af1c4의 앱 코드와 같습니다. 이 기록 자체의 후속 CI/배포 성공을 앞선 결과로 대신 표시하지 않습니다. 아래는 완료 전 진단 이력입니다.

## 2026-11-13 Source 복구·배포 완료 이벤트 확인

GitHub 계정 연결 뒤에도 서비스 Source 자체가 비어 있는 상태를 API에서 확인했습니다. 기존 `pixel-class` 서비스에 `dhdh09080/pixel-class`를 다시 연결했고, 최종 설정은 `branch: deploy/railway-verified`, `checkSuites: false`, 커밋 고정 없음·대기 변경 없음입니다. Volume·17개 변수·단일 인스턴스·도메인은 유지합니다.

배포 `84dce27e-4ba4-4662-9c5c-80a3365aeec0` / `4c1269f`는 SUCCESS입니다. [배포 전 CI43327398751](https://github.com/dhdh09080/pixel-class/actions/runs/43327398751)와 [deployment_status로 자동 실행된 외부 CI43338551053](https://github.com/dhdh09080/pixel-class/actions/runs/43338551053)도 성공했습니다. 실제 HTTPS 커밋·익명 API/로그인/WSS 차단·공개 자산을 확인했습니다. 정상 계정 로그인·인증된 WSS101은 미검증입니다.

이 복구 기록을 main에 올려, 추가 source 연결이나 Deploy 호출 없이 후속 push가 자동 배포되는지 확인합니다. 현재 Source 복구와 배포 완료 이벤트 검사는 성공이며, 후속 무인 push는 검증 중입니다. 아래는 이전 진단 이력입니다.

## 이전 진단 — 운영 정상, Railway 무인 시작은 미확인

2026-11-13 08:15 KST 관측. 사용자의 초기 설정은 적용됐고 현재 배포 `0468e159-4eb1-4b81-9cf2-5bc18939eb5c` / `8a3f4a8`은 SUCCESS입니다. 실제 커밋 일치·HTTPS·익명 API/로그인/WSS 차단·공개 자산은 [CI43320443111](https://github.com/dhdh09080/pixel-class/actions/runs/43320443111)에서 통과했습니다. 정상 계정의 외부 로그인·인증된 WSS 101은 미검증입니다.

최신 [CI43324847422](https://github.com/dhdh09080/pixel-class/actions/runs/43324847422)는 **190개 검사와 publish를 포함해 workflow 전체 성공**입니다. 원격 배포 브랜치도 `594b620`으로 정상 갱신됐습니다. 배포 후 검사를 별도의 deployment_status workflow로 분리해, 해당 CI가 배포 완료를 기다리는 순환 대기 가능성도 제거했습니다.

그러나 이 성공 뒤에도 Railway의 새 배포 이벤트는 관측되지 않았습니다. **완전 자동 배포 완료로 판정하지 않습니다.** 동일 연결 재등록으로 시작한 배포를 자동 push 배포 성공으로 계산하지 않았습니다. 사용자가 Settings → Source의 Enable/Disable 또는 GitHub 권한 메시지를 확인해야 합니다. 사용 가능한 Railway 도구는 이 스위치를 노출하지 않으며 브라우저 조작 연결도 두 번 실패했습니다. 스위치가 꺼져 있다고 단정하거나 특정 원인을 확정하지 않습니다.

현재 앱과 최신 검사 커밋의 서버·프런트·의존성·시작/복구 로직은 같습니다. 차이는 CI와 문서이며 기존 Volume·17개 변수·계정·도메인을 보존합니다. [상세 관측](docs/automation/state.json). 이후 내용은 설정·진단 이력입니다.

## 동작 순서

1. main에 정상 push/병합합니다. PR에서는 배포하지 않습니다.
2. 전체 서버·브라우저·두 Docker HTTPS 운영 프로필이 통과해야 publish가 실행됩니다.
3. 현재 main 커밋만 `deploy/railway-verified`로 정상 push합니다. 오래된 실행은 생략하고, 분기된 배포 이력은 강제로 덮어쓰지 않습니다.
4. Railway는 이 브랜치를 자동 배포합니다. Commit Sha 고정을 제거하며 별도 Railway “Wait for CI”는 사용하지 않습니다. 검증 완료 뒤에만 브랜치를 갱신하는 구조로 순환 대기를 방지합니다.
5. 배포 전 CI는 verify·publish 이후 종료합니다. 별도 `deployed-release.yml`이 Railway의 성공 deployment_status 이벤트를 받아 live를 실행합니다. live 작업은 실제 HTTPS health의 `X-Pixel-Class-Commit`이 검증 커밋과 같아질 때까지 기다린 후 비공개 입구·익명 API/WSS 차단·공개 기능 자산을 검사합니다. 실제 계정 로그인·인증된 WSS 101은 포함하지 않습니다.

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

## GitHub 연결 재등록과 두 번째 자동 배포 확인

첫 후속 커밋 `8a3f4a8`은 CI43320443111의 190개 검사와 자동 승격을 통과했지만, 배포 브랜치 갱신 뒤 Railway의 새 배포 이벤트가 관측되지 않았습니다. 이를 자동 배포 성공으로 처리하지 않았습니다.

프로젝트가 기존 private-test 환경·pixel-class 서비스 하나뿐임을 확인하고, 이미 사용자가 적용한 동일 저장소/브랜치로 정식 GitHub source 연결을 재등록했습니다. 새 키·리소스·Volume·변수·도메인은 만들거나 바꾸지 않았습니다. 연결 도구는 재등록 성공과 해당 브랜치의 배포 시작을 반환했습니다. 이 재등록이 시작한 배포도 별도의 무인 push 이벤트 성공으로 세지 않습니다.

이번 재등록 기록을 main에 정상 push해 새 커밋의 **검증 → 자동 승격 → Railway push 배포 → 외부 커밋 확인**을 다시 관측합니다. 추가 사용자 설정은 요청하지 않았습니다.

## 배포 전·후 workflow 분리

두 번째 후속 커밋 `2ee3701`도 190개 검사와 승격을 통과했지만 새 Railway 배포는 아직 관측되지 않았습니다. 현재 서비스의 `8a3f4a8` 배포와 외부 검사는 정상입니다.

Railway 공식 지침은 전체 GitHub workflow의 완료 상태를 기다리는 경우가 있음을 명시합니다. 따라서 source 설정에서 노출되지 않는 CI 대기 옵션에도 순환 대기가 생기지 않도록 배포 전 verify/publish와 배포 후 live를 서로 다른 workflow로 분리했습니다. 원인이 해당 옵션이라고 단정하지 않습니다. 배포 전 190개 검사와 배포 후 정확한 커밋·익명 보호·공개 자산 검사는 제거하거나 완화하지 않았습니다. 후속 자동 배포를 관측하기 전에는 자동 배포 완료로 판정하지 않습니다.

출처: https://docs.railway.com/cli/deploying#post-deployment-actions · https://docs.railway.com/deployments/github-autodeploys#enabling-wait-for-ci

import { writeFileSync, existsSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
if (existsSync('.env')) {
  console.error(
    '.env가 이미 있어요. 기존 파일을 보존했습니다. README의 비공개 학교 설정을 확인해 주세요.',
  );
  process.exit(1);
}
const key = randomBytes(32).toString('base64url');
writeFileSync(
  '.env',
  `# Local private school: do not commit this file.\nDEMO_MODE=false\nDATABASE_PATH=data/school.sqlite\nMASTER_BOOTSTRAP_KEY=${key}\nHOST=127.0.0.1\nPORT=3001\nCOOKIE_SECURE=false\nPUBLIC_ORIGIN=\nOPENAI_API_KEY=\nOPENAI_MODEL=\n`,
  { mode: 0o600, flag: 'wx' },
);
console.log(
  '비공개 학교 설정을 .env에 저장했습니다. npm run dev 실행 후 .env의 MASTER_BOOTSTRAP_KEY로 최초 MASTER를 등록하세요. KEY 원문은 로그에 출력하지 않습니다.',
);

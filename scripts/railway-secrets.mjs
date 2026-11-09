import { randomBytes } from 'node:crypto';
import { writeFileSync, realpathSync } from 'node:fs';
import { resolve, dirname, relative, isAbsolute } from 'node:path';

const destination = process.argv[2];
if (!destination || !isAbsolute(destination))
  throw Error('Supply an absolute path outside this repository, in a private directory.');
const target = resolve(realpathSync(dirname(destination)), destination.split('/').at(-1));
const relation = relative(realpathSync(process.cwd()), target);
if (!relation.startsWith('../') && !isAbsolute(relation))
  throw Error('Never generate deployment secrets inside the repository.');
process.umask(0o077);
writeFileSync(
  target,
  `MASTER_BOOTSTRAP_KEY=${randomBytes(32).toString('hex')}\nSTAGING_ACCESS_KEY=${randomBytes(32).toString('hex')}\n`,
  { flag: 'wx', mode: 0o600 },
);
console.log(
  'Created a private 0600 file. Import its two keys as Railway sealed variables; values were not printed.',
);

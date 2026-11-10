import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

export const accessCookie = '__Host-pixel_access';
export const accessDuration = 7 * 86400_000;

export function validAccessCode(code: unknown, secret: string | undefined) {
  if (typeof code !== 'string' || code.length > 128 || !secret) return false;
  return timingSafeEqual(
    createHash('sha256').update(code).digest(),
    createHash('sha256').update(secret).digest(),
  );
}

/** A signed, short-lived pass. The access code itself never goes into the cookie. */
export function createAccessPass(secret: string, expires = Date.now() + accessDuration) {
  const signature = createHmac('sha256', secret)
    .update('pixel-access:' + expires)
    .digest('hex');
  return expires + '.' + signature;
}

export function validAccessPass(cookies: string | undefined, secret: string | undefined) {
  const value = cookies
    ?.split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(accessCookie + '='))
    ?.slice(accessCookie.length + 1);
  const match = /^(\d{13})\.[a-f0-9]{64}$/.exec(value || '');
  if (!secret || !match || Number(match[1]) <= Date.now()) return false;
  return timingSafeEqual(
    Buffer.from(value!),
    Buffer.from(createAccessPass(secret, Number(match[1]))),
  );
}

export function entranceInvite(value: unknown) {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{8,100}$/.test(value) ? value : '';
}

export function entrancePage(invite: string, error = '') {
  return (
    /* html */ '<!doctype html>' +
    '<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">' +
    '<meta name="robots" content="noindex"><title>교실 접근 · Pixel Class</title><style>' +
    entranceStyles +
    '</style></head><body><main>' +
    '<header><span class="logo" aria-hidden="true">&gt;_</span><span>PIXEL CLASS</span><span class="step">01 / 02</span></header>' +
    '<div class="content"><p class="label">PRIVATE WORKSPACE</p><h1>교실 접근</h1>' +
    '<p class="intro">공용 접근 비밀번호를 입력하면 ' +
    (invite ? '학생 가입' : '계정 로그인') +
    ' 화면으로 이동해요.</p>' +
    '<form action="/access" method="post"><input type="hidden" name="invite" value="' +
    invite +
    '">' +
    '<label for="code">공용 접근 비밀번호</label><input id="code" name="code" type="password" autocomplete="current-password" required maxlength="128" ' +
    (error ? 'aria-invalid="true" aria-describedby="error"' : '') +
    '>' +
    (error ? '<p id="error" role="alert">' + error + '</p>' : '') +
    '<button type="submit">계속하기 <span aria-hidden="true">→</span></button></form>' +
    '<p class="note">선생님은 접속 안내 파일에서 확인하세요. 학생은 선생님에게 받은 공용 암호를 사용하세요.</p></div></main></body></html>'
  );
}

const entranceStyles = /* css */ `
:root{color-scheme:dark;font-family:system-ui,"Malgun Gothic",sans-serif;background:#0e1420;color:#edf2ff}
*{box-sizing:border-box}body{margin:0;min-height:100svh;display:grid;place-items:center;padding:22px;background:radial-gradient(ellipse at 50% 5%,#23345880,transparent 55%),radial-gradient(#6a7ea336 1px,transparent 1px) 0 0/22px 22px}
main{width:min(100%,458px);background:#151e2f;border:1px solid #364562;border-radius:17px;overflow:hidden;box-shadow:0 22px 75px #0408138c}
header{display:flex;align-items:center;gap:11px;padding:14px 22px;border-bottom:1px solid #364562;color:#dbe8ff;font:700 12px Consolas,monospace;letter-spacing:.1em}
.logo,.step{padding:5px 7px;border:1px solid #466376;border-radius:5px;color:#8ce6d1}.step{margin-left:auto;color:#bdcae1;border-color:#364562}
.content{padding:clamp(21px,5vw,34px)}.label{margin:0;color:#8ce6d1;font:700 11px Consolas,monospace;letter-spacing:.12em}
h1{font-size:clamp(24px,5vw,34px);margin:7px 0;letter-spacing:-.05em}.intro,.note{color:#bccae0;line-height:1.65;font-size:14px}.intro{margin:0 0 22px}.note{font-size:12px;margin:16px 0 0}
form{display:grid;gap:9px}label{font-size:13px;font-weight:650}input,button{width:100%;min-height:46px;border-radius:8px;padding:9px 12px;font:inherit}
input{background:#0f1726;color:#f0f5ff;border:1px solid #65789c}button{display:flex;justify-content:space-between;background:#91e8d3;color:#122437;border:0;cursor:pointer;font-weight:800;margin-top:5px}
button:hover{background:#acf3e2}input:focus-visible,button:focus-visible{outline:3px solid #9caeff;outline-offset:3px}#error{margin:0;color:#ffadb9;font-size:13px}
`;

import { useState } from 'react';
import { CalendarDays, Check, Clock3, ExternalLink, Trophy } from 'lucide-react';
import { Badge } from './ui';
import './competition.css';

export const phaseNames: Record<string, string> = {
  DRAFT: '준비 중',
  UPCOMING: '접수 예정',
  SUBMISSION_OPEN: '작품 접수 중',
  SUBMISSION_CLOSED: '접수 마감',
  JUDGING: '심사 중',
  JUDGING_CLOSED: '심사 종료',
  RESULTS_PUBLISHED: '결과 발표',
  ARCHIVED: '보관됨',
};
export function PhaseBadge({ state }: { state: string }) {
  return (
    <Badge
      tone={state === 'SUBMISSION_OPEN' ? 'success' : state === 'JUDGING' ? 'warning' : 'neutral'}
    >
      {phaseNames[state] || state}
    </Badge>
  );
}
export const kst = (value?: string) =>
  value
    ? new Date(value).toLocaleString('ko-KR', {
        timeZone: 'Asia/Seoul',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
      })
    : '미정';
export const toKstInput = (value?: string) =>
  value ? new Date(new Date(value).getTime() + 9 * 3600000).toISOString().slice(0, 16) : '';
export function fromKstInput(value: string) {
  const date = new Date(`${value}:00+09:00`);
  if (!Number.isFinite(date.getTime()))
    throw new Error('한국 시간으로 올바른 날짜와 시간을 입력해 주세요.');
  return date.toISOString();
}
export const scoreCriteria = [
  {
    key: 'practicality',
    label: '실무 적용 가능성',
    max: 35,
    description: '현장에서 겪는 문제를 해결하고, 실제로 활용할 수 있나요?',
  },
  {
    key: 'usability',
    label: '사용 편의성',
    max: 30,
    description: '처음 접하는 사람도 목적과 사용법을 이해하고 쉽게 이용할 수 있나요?',
  },
  {
    key: 'completeness',
    label: '완성도',
    max: 20,
    description: '소개한 핵심 기능이 안정적으로 작동하고 결과물을 확인할 수 있나요?',
  },
  {
    key: 'creativity',
    label: '창의성',
    max: 15,
    description: '문제를 새롭게 바라보고 AI를 목적에 맞게 활용했나요?',
  },
] as const;
export const introFields = [
  ['serviceName', '서비스 이름'],
  ['purpose', '서비스를 만든 목적'],
  ['problem', '해결하고 싶은 문제'],
  ['audience', '이 서비스를 사용할 사람'],
  ['features', '주요 기능'],
  ['usage', '사용 방법'],
  ['examples', '활용 예시'],
  ['aiTools', '활용한 AI와 도구'],
  ['development', '개발 과정과 배운 점'],
  ['screenshots', '화면 설명'],
  ['effect', '기대 효과'],
  ['nextSteps', '앞으로 개선할 점'],
] as const;
export type IntroValues = Record<(typeof introFields)[number][0], string>;
export const emptyIntro = (): IntroValues =>
  Object.fromEntries(introFields.map(([key]) => [key, ''])) as IntroValues;
export type UploadValue = { fileName: string; mime: string; base64: string };
export async function readCompetitionFile(file: File, htmlOnly = false): Promise<UploadValue> {
  if (file.size > 5 * 1024 * 1024) throw new Error('파일은 5MB 이하로 선택해 주세요.');
  if (htmlOnly && !/\.html$/i.test(file.name))
    throw new Error('소개서는 HTML 파일(.html)을 선택해 주세요.');
  const source = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('파일을 읽지 못했어요. 다시 선택해 주세요.'));
    reader.readAsDataURL(file);
  });
  return {
    fileName: file.name,
    mime: file.type || 'application/octet-stream',
    base64: source.slice(source.indexOf(',') + 1),
  };
}
const previewPolicy =
  "default-src 'none'; img-src data:; style-src 'unsafe-inline'; font-src 'none'; frame-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'; object-src 'none'";
/** Server-sanitized HTML is still isolated in an opaque-origin, script-free document. */
export function IntroductionPreview({
  html,
  title = '서비스 소개서 미리보기',
  compact = false,
}: {
  html: string;
  title?: string;
  compact?: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const document = `<!doctype html><html lang="ko"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="${previewPolicy}"><meta name="viewport" content="width=device-width, initial-scale=1"><style>body{font:15px/1.75 system-ui,sans-serif;color:#293d32;background:#fffef9;padding:24px;overflow-wrap:anywhere}img{max-width:100%;height:auto}h1,h2,h3{line-height:1.4}pre{white-space:pre-wrap}table{max-width:100%;border-collapse:collapse}td,th{border:1px solid #d9dfd0;padding:6px}a{color:#345944}</style></head><body>${html}</body></html>`;
  return (
    <div className="competition-preview-wrap">
      <iframe
        className={`competition-intro-preview ${compact && !expanded ? 'is-compact' : ''}`}
        title={title}
        sandbox=""
        referrerPolicy="no-referrer"
        srcDoc={document}
      />
      {compact && (
        <button
          type="button"
          className="button secondary competition-preview-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? '소개서 작게 보기' : '소개서 크게 보기'}
        </button>
      )}
    </div>
  );
}
export function CompetitionSchedule({
  competition,
}: {
  competition: {
    opensAt: string;
    submissionDueAt: string;
    judgingStartsAt: string;
    judgingEndsAt: string;
    resultsAt: string;
  };
}) {
  return (
    <ol className="competition-timeline" aria-label="경진대회 일정 · 한국 시간">
      {[
        ['작품 접수 시작', competition.opensAt],
        ['작품 제출 마감', competition.submissionDueAt],
        ['심사 시작', competition.judgingStartsAt],
        ['심사 종료', competition.judgingEndsAt],
        ['결과 발표 예정', competition.resultsAt],
      ].map(([label, value], i) => (
        <li key={label}>
          <span className="competition-timeline-icon">
            {i === 4 ? (
              <Trophy size={16} />
            ) : i === 1 ? (
              <Clock3 size={16} />
            ) : (
              <CalendarDays size={16} />
            )}
          </span>
          <div>
            <strong>{label}</strong>
            <time dateTime={value}>{kst(value)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}
export function ServiceLink({ url }: { url?: string }) {
  if (!url) return null;
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return null;
  }
  if (!['http:', 'https:'].includes(parsed.protocol)) return null;
  return (
    <a
      className="button secondary competition-service-link"
      href={parsed.href}
      target="_blank"
      rel="noopener noreferrer"
      referrerPolicy="no-referrer"
    >
      <ExternalLink size={16} />
      서비스 열기<span className="visually-hidden"> · 외부 사이트, 새 창</span>
    </a>
  );
}
export function SavedNote({ children }: { children: React.ReactNode }) {
  return (
    <p className="competition-saved" role="status">
      <Check size={16} />
      {children}
    </p>
  );
}

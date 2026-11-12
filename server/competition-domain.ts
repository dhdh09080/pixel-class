import sanitizeHtml from 'sanitize-html';
import type {
  CompetitionEntry,
  CompetitionResult,
  CompetitionScoreInput,
} from '../shared/competitions.js';
const uuidPart = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
/** Exact anonymous entrance exception. It never matches school/account API routes. */
export function isPublicCompetitionRequest(method: string, path: string) {
  if (method === 'GET' && new RegExp(`^/competition/${uuidPart}/?$`).test(path)) return true;
  if (
    method === 'GET' &&
    /^\/competition-assets\/[A-Za-z0-9_.-]+\.(?:js|css|woff2|png|svg)$/.test(path)
  )
    return true;
  const base = `/api/public/competitions/${uuidPart}`;
  return (
    (method === 'GET' && new RegExp(`^${base}$`).test(path)) ||
    (['POST', 'DELETE'].includes(method) && new RegExp(`^${base}/judge-session$`).test(path)) ||
    (method === 'POST' && new RegExp(`^${base}/entries/${uuidPart}/scores$`).test(path)) ||
    (method === 'GET' && new RegExp(`^${base}/entries/${uuidPart}/files/${uuidPart}$`).test(path))
  );
}
/** Vite preload maps also contain asset URLs inside the trusted JavaScript bundle. */
export function publicCompetitionAsset(source: string) {
  return source.replace(/([("'`])\/?assets\//g, '$1/competition-assets/');
}
/** No active content, URLs, CSS, remote images or attributes survive this parser allowlist. */
export function sanitizeCompetitionHtml(input: string) {
  return sanitizeHtml(input, {
    allowedTags: [
      'p',
      'h1',
      'h2',
      'h3',
      'h4',
      'ul',
      'ol',
      'li',
      'strong',
      'b',
      'em',
      'i',
      'blockquote',
      'pre',
      'code',
      'table',
      'thead',
      'tbody',
      'tr',
      'td',
      'th',
      'br',
      'hr',
    ],
    allowedAttributes: {},
    allowedSchemes: [],
    allowProtocolRelative: false,
    disallowedTagsMode: 'discard',
    enforceHtmlBoundary: true,
  });
}
export type RankedScore = Pick<
  CompetitionScoreInput,
  'practicality' | 'usability' | 'completeness' | 'creativity'
> & { entryId: string };
/** Compare exact integer fractions, never rounded display scores, including ties. */
export function competitionRanking(
  entries: Pick<CompetitionEntry, 'id' | 'title' | 'displayName'>[],
  scores: RankedScore[],
  minimum: number,
  awards: string[],
): CompetitionResult[] {
  const rows = entries.map((e) => {
    const own = scores.filter((s) => s.entryId === e.id),
      count = own.length;
    const sums = (['practicality', 'usability', 'completeness', 'creativity'] as const).map((k) =>
      own.reduce((v, s) => v + s[k], 0),
    );
    return {
      entry: e,
      count,
      sums,
      total: sums.reduce((v, n) => v + n, 0),
      eligible: count >= minimum,
    };
  });
  function compare(a: (typeof rows)[number], b: (typeof rows)[number]) {
    if (a.eligible !== b.eligible) return a.eligible ? -1 : 1;
    for (const [av, bv] of [[a.total, b.total], ...a.sums.map((v, i) => [v, b.sums[i]])]) {
      const delta = BigInt(av) * BigInt(b.count || 1) - BigInt(bv) * BigInt(a.count || 1);
      if (delta) return delta > 0n ? -1 : 1;
    }
    return 0;
  }
  rows.sort((a, b) => compare(a, b) || a.entry.id.localeCompare(b.entry.id));
  let rank = 0;
  return rows.map((r, i) => {
    if (!i || compare(rows[i - 1], r)) rank = i + 1;
    const [practicality, usability, completeness, creativity] = r.sums.map((v) =>
      r.count ? v / r.count : 0,
    );
    return {
      entryId: r.entry.id,
      title: r.entry.title,
      displayName: r.entry.displayName,
      count: r.count,
      average: r.count ? r.total / r.count : 0,
      practicality,
      usability,
      completeness,
      creativity,
      eligible: r.eligible,
      rank: r.eligible ? rank : null,
      award: r.eligible ? awards[rank - 1] || null : null,
    };
  });
}

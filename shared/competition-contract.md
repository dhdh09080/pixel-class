# Competition contract

Canonical DTOs: `shared/competitions.ts`. Dates are ISO timestamps; UI inputs should convert Asia/Seoul wall time with an explicit +09:00 offset. Server deadlines are authoritative. `Competition.state` is computed, never accepted as a write field.

- GET /api/competitions → CompetitionListResponse
- POST /api/competitions → Competition (config fields from DTO, draft by default)
- GET /api/competitions/:id → CompetitionDetailResponse
- PATCH /api/competitions/:id → Competition (revision required)
- POST /api/competitions/:id/action {action:publish|unpublish|archive|publishResults|retractResults,reason?}
- PUT /api/competitions/:id/entry {projectId,title,displayName,serviceUrl,consentPublic,intro?,introFile?:{fileName,mime?,base64},artifact?:same,expectedRevision?:number,submit?:boolean}
- POST /api/competitions/:id/withdraw
- POST /api/competitions/:id/extensions {studentId,dueAt,reason}
- POST /api/competitions/:id/judge-passes {label,expiresAt?,entryIds?:string[]} → {key,pass}; raw key only once
- DELETE /api/competitions/:id/judge-passes/:passId (revoke)
- POST /api/classes {name}; PATCH /api/classes/:id/members {memberIds}; PATCH /api/competition-classroom {classId}
- GET /api/public/competitions/:id → PublicCompetitionResponse (ignores account session)
- POST /api/public/competitions/:id/judge-session {key} → {ok:true}; scoped HttpOnly judge cookie
- DELETE /api/public/competitions/:id/judge-session → {ok:true}
- POST /api/public/competitions/:id/entries/:entryId/scores CompetitionScoreInput → {ok:true,score:{practicality,usability,completeness,creativity,total,comment}}

Public page: `/competition/:id#judge=KEY`; read and remove fragment immediately, then activate through body. All writes require X-Pixel-Class:1 and same origin. Judge session grants no account access. Public `entries` contain only display alias, entry title, submitted intro and explicitly submitted result link/files. HTML preview is parser-sanitized, static, rendered in an iframe with sandbox="" and strict CSP. Original HTML downloads separately as attachment. Default visibility judges-only; PUBLIC requires per-entry consent. MASTER can see unpublished aggregate results; public/students only after explicit publication. Scores are immutable; duplicate requests with the same idempotency key and content safely replay, other duplicates return 409.

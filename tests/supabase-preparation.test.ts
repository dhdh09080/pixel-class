import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
test('prepared PostgreSQL migration enforces public/private project isolation and server-only admission', async () => {
  const pg = new PGlite();
  try {
    await pg.exec(
      `create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;grant usage on schema auth to authenticated,service_role;grant execute on function auth.uid() to authenticated,service_role;`,
    );
    const file = readdirSync('supabase/migrations').find((f) =>
      f.endsWith('_pixel_class_v02_preparation.sql'),
    )!;
    await pg.exec(readFileSync('supabase/migrations/' + file, 'utf8'));
    const ids = [
      '00000000-0000-0000-0000-000000000001',
      '00000000-0000-0000-0000-000000000002',
      '00000000-0000-0000-0000-000000000003',
      '00000000-0000-0000-0000-000000000004',
    ];
    for (let i = 0; i < ids.length; i++) {
      await pg.query('insert into auth.users values($1)', [ids[i]]);
      await pg.query('insert into pixel_class.profiles values($1,$2,$3)', [
        'user-' + i,
        ids[i],
        '사용자' + i,
      ]);
    }
    await pg.exec(
      `insert into pixel_class.schools values('school-a','학교A'),('school-b','학교B');insert into pixel_class.school_memberships values('school-a','user-0','MASTER','ACTIVE'),('school-a','user-1','STUDENT','ACTIVE'),('school-a','user-2','STUDENT','ACTIVE'),('school-b','user-3','STUDENT','ACTIVE');insert into pixel_class.classrooms values('room-a','school-a',1120,700);insert into pixel_class.projects values('public-p','school-a','user-1','공개 제목','공개 목적','BUILDING',true,false,'',''),('private-p','school-a','user-1','비공개 제목','비공개 목적','BUILDING',false,false,'','');insert into pixel_class.project_details values('public-p','school-a','{"secret":"공개 프로젝트의 비공개 질문"}'),('private-p','school-a','{"secret":"개인 기록"}');`,
    );
    const impersonate = async (index: number) => {
      await pg.exec('reset role');
      await pg.query("select set_config('request.jwt.claim.sub',$1,false)", [ids[index]]);
      await pg.exec('set role authenticated');
    };
    await impersonate(2);
    assert.equal((await pg.query('select * from pixel_class.projects')).rows.length, 1);
    assert.equal((await pg.query('select * from pixel_class.project_details')).rows.length, 0);
    await assert.rejects(() =>
      pg.exec("update pixel_class.school_memberships set role='MASTER' where profile_id='user-2'"),
    );
    await assert.rejects(() =>
      pg.exec("select pixel_class.admit_student('school-a','user-2','bad')"),
    );
    await impersonate(1);
    assert.equal((await pg.query('select * from pixel_class.project_details')).rows.length, 2);
    await impersonate(0);
    assert.equal((await pg.query('select * from pixel_class.project_details')).rows.length, 2);
    await impersonate(3);
    assert.equal((await pg.query('select * from pixel_class.projects')).rows.length, 0);
    await pg.exec('reset role');
    await pg.exec(
      "insert into auth.users values('00000000-0000-0000-0000-000000000005');insert into pixel_class.profiles values('new-student','00000000-0000-0000-0000-000000000005','새 학생');insert into pixel_class.invitations values('invite','school-a','hashed-key',now()+interval '7 days',null,false);set role service_role;",
    );
    const admitted = await pg.query<{ admit_student: string }>(
      "select pixel_class.admit_student('school-a','new-student','hashed-key')",
    );
    assert.ok(admitted.rows[0].admit_student);
    await assert.rejects(() =>
      pg.exec("select pixel_class.admit_student('school-a','new-student','hashed-key')"),
    );
    await pg.exec(
      "select pixel_class.change_membership('school-a','new-student','user-0','ON_LEAVE','휴학',true);select pixel_class.change_membership('school-a','new-student','user-0','ACTIVE','복학',false);",
    );
    const restored = await pg.query<{ desk_id: string }>(
      "select desk_id from pixel_class.desk_assignments where profile_id='new-student'",
    );
    assert.equal(restored.rows[0].desk_id, admitted.rows[0].admit_student);
    await pg.exec('reset role');
    await pg.exec(readFileSync('scripts/verify-supabase.sql', 'utf8'));
  } finally {
    await pg.close();
  }
});

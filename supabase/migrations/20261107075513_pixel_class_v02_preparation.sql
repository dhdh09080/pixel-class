-- PREPARATION ONLY. Apply to a new Pixel Class staging project after backup and review.
-- Authentication accounts are created by Supabase Auth; admission is a separate atomic transaction.
-- Authenticated clients have scoped READ access only. Writes remain server mediated.
begin;
create schema pixel_class;
create schema pixel_private;
revoke all on schema pixel_class, pixel_private from public, anon;
grant usage on schema pixel_class, pixel_private to authenticated, service_role;
create table pixel_class.schools(id text primary key,name text not null);
create table pixel_class.profiles(id text primary key,auth_user_id uuid not null unique references auth.users(id),name text not null);
create table pixel_class.school_memberships(school_id text not null references pixel_class.schools(id),profile_id text not null references pixel_class.profiles(id),role text not null check(role in ('MASTER','STUDENT')),status text not null check(status in ('INVITED','ACTIVE','ON_LEAVE','GRADUATED','REVOKED')),primary key(school_id,profile_id));
create index memberships_profile_school on pixel_class.school_memberships(profile_id,school_id,status);
create table pixel_class.classrooms(id text primary key,school_id text not null references pixel_class.schools(id),width integer not null default 1120,height integer not null default 700,unique(id,school_id),check(width=1120 and height>=700));
create table pixel_class.characters(profile_id text primary key references pixel_class.profiles(id),appearance jsonb not null);
create table pixel_class.desks(id text primary key,school_id text not null,classroom_id text not null,x integer not null,y integer not null,unique(id,school_id),foreign key(classroom_id,school_id) references pixel_class.classrooms(id,school_id),check(x between 275 and 795 and y>=285));
create index desks_school on pixel_class.desks(school_id);
create table pixel_class.desk_assignments(school_id text not null,profile_id text not null,desk_id text unique,previous_desk_id text,primary key(school_id,profile_id),foreign key(school_id,profile_id) references pixel_class.school_memberships(school_id,profile_id),foreign key(desk_id,school_id) references pixel_class.desks(id,school_id),foreign key(previous_desk_id,school_id) references pixel_class.desks(id,school_id));
create table pixel_class.invitations(id text primary key,school_id text not null references pixel_class.schools(id),key_hash text not null unique,expires_at timestamptz not null,used_at timestamptz,revoked boolean not null default false);
create table pixel_class.membership_status_history(id text primary key,school_id text not null,profile_id text not null,actor_id text not null,previous_status text not null,next_status text not null,reason text not null,created_at timestamptz not null default now(),foreign key(school_id,profile_id) references pixel_class.school_memberships(school_id,profile_id),foreign key(school_id,actor_id) references pixel_class.school_memberships(school_id,profile_id));
-- Public fields are physically separated from private learning data.
create table pixel_class.projects(id text primary key,school_id text not null,owner_id text not null,title text not null,purpose text not null default '',status text not null,is_public boolean not null default false,approved boolean not null default false,github_url text not null default '',service_url text not null default '',unique(id,school_id),foreign key(school_id,owner_id) references pixel_class.school_memberships(school_id,profile_id));
create index projects_school_owner on pixel_class.projects(school_id,owner_id);
create table pixel_class.project_details(project_id text primary key,school_id text not null,body jsonb not null,foreign key(project_id,school_id) references pixel_class.projects(id,school_id));
create table pixel_class.teaching_materials(id text primary key,school_id text not null references pixel_class.schools(id),title text not null,description text not null default '',topics text[] not null default '{}',storage_path text not null,version integer not null default 1,created_at timestamptz not null default now());
create table pixel_class.messages(id text primary key,school_id text not null references pixel_class.schools(id),sender_id text not null,recipient_id text,body jsonb not null,foreign key(school_id,sender_id) references pixel_class.school_memberships(school_id,profile_id),foreign key(school_id,recipient_id) references pixel_class.school_memberships(school_id,profile_id));
create table pixel_class.notifications(id text primary key,school_id text not null,profile_id text not null,body jsonb not null,read_at timestamptz,foreign key(school_id,profile_id) references pixel_class.school_memberships(school_id,profile_id));
-- Child entities are split for a gradual import from SQLite JSON aggregates.
do $$ declare entity text; begin
 foreach entity in array array['project_tasks','project_roadmap_steps','project_updates','project_questions','mentor_feedback','project_submissions','project_attachments','ai_conversations','ai_messages','ai_job_runs'] loop
  execute format('create table pixel_class.%I(id text primary key,project_id text not null,school_id text not null,body jsonb not null,foreign key(project_id,school_id) references pixel_class.projects(id,school_id))',entity);
  execute format('create index on pixel_class.%I(school_id,project_id)',entity);
 end loop;
end $$;
-- Private authorization lookups must bypass membership RLS to avoid recursion.
-- They have fixed SQL, explicit auth.uid checks, no caller-supplied user identity and a locked search_path.
create function pixel_private.current_profile() returns text language sql stable security definer set search_path='' as $$
 select p.id from pixel_class.profiles p where auth.uid() is not null and p.auth_user_id=(select auth.uid())
$$;
create function pixel_private.member_of(scope text,master_only boolean default false) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from pixel_class.school_memberships m join pixel_class.profiles p on p.id=m.profile_id where m.school_id=scope and p.auth_user_id=(select auth.uid()) and m.status='ACTIVE' and (not master_only or m.role='MASTER'))
$$;
create function pixel_private.can_read_project(project text) returns boolean language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from pixel_class.projects j join pixel_class.school_memberships m on m.school_id=j.school_id join pixel_class.profiles p on p.id=m.profile_id where j.id=project and p.auth_user_id=(select auth.uid()) and ((m.profile_id=j.owner_id and m.status in ('ACTIVE','ON_LEAVE','GRADUATED')) or (m.role='MASTER' and m.status='ACTIVE')))
$$;
revoke all on function pixel_private.current_profile(),pixel_private.member_of(text,boolean),pixel_private.can_read_project(text) from public,anon;
grant execute on function pixel_private.current_profile(),pixel_private.member_of(text,boolean),pixel_private.can_read_project(text) to authenticated,service_role;
do $$ declare tab text; begin
 for tab in select tablename from pg_tables where schemaname='pixel_class' loop
  execute format('alter table pixel_class.%I enable row level security',tab);
 end loop;
end $$;
create policy schools_read on pixel_class.schools for select to authenticated using(pixel_private.member_of(id));
create policy profile_read on pixel_class.profiles for select to authenticated using(id=pixel_private.current_profile() or exists(select 1 from pixel_class.school_memberships m where m.profile_id=id and pixel_private.member_of(m.school_id)));
create policy membership_read on pixel_class.school_memberships for select to authenticated using(profile_id=pixel_private.current_profile() or pixel_private.member_of(school_id));
create policy classroom_read on pixel_class.classrooms for select to authenticated using(pixel_private.member_of(school_id));
create policy character_read on pixel_class.characters for select to authenticated using(profile_id=pixel_private.current_profile() or exists(select 1 from pixel_class.school_memberships m where m.profile_id=characters.profile_id and pixel_private.member_of(m.school_id)));
create policy desks_read on pixel_class.desks for select to authenticated using(pixel_private.member_of(school_id));
create policy assignment_read on pixel_class.desk_assignments for select to authenticated using(pixel_private.member_of(school_id));
create policy invitation_read on pixel_class.invitations for select to authenticated using(pixel_private.member_of(school_id,true));
create policy history_read on pixel_class.membership_status_history for select to authenticated using(pixel_private.member_of(school_id,true));
create policy projects_read on pixel_class.projects for select to authenticated using(pixel_private.can_read_project(id) or (is_public and pixel_private.member_of(school_id)));
create policy details_read on pixel_class.project_details for select to authenticated using(pixel_private.can_read_project(project_id));
create policy material_read on pixel_class.teaching_materials for select to authenticated using(pixel_private.member_of(school_id));
create policy messages_read on pixel_class.messages for select to authenticated using(pixel_private.member_of(school_id) and (recipient_id is null or recipient_id=pixel_private.current_profile() or sender_id=pixel_private.current_profile()));
create policy notifications_read on pixel_class.notifications for select to authenticated using(profile_id=pixel_private.current_profile() and exists(select 1 from pixel_class.school_memberships m where m.school_id=notifications.school_id and m.profile_id=notifications.profile_id and m.status<>'REVOKED'));
do $$ declare entity text; begin
 foreach entity in array array['project_tasks','project_roadmap_steps','project_updates','project_questions','mentor_feedback','project_submissions','project_attachments','ai_conversations','ai_messages','ai_job_runs'] loop
  execute format('create policy child_read on pixel_class.%I for select to authenticated using(pixel_private.can_read_project(project_id))',entity);
 end loop;
end $$;
grant select on all tables in schema pixel_class to authenticated;
grant all on all tables in schema pixel_class to service_role;
-- No direct INSERT/UPDATE/DELETE grants to authenticated. The server must keep its role/ownership checks.
create function pixel_private.assign_desk(scope text,student text) returns text language plpgsql security invoker set search_path='' as $$
declare chosen text; previous text; room text; row_no integer; column_x integer;begin
 select previous_desk_id into previous from pixel_class.desk_assignments where school_id=scope and profile_id=student;
 select d.id into chosen from pixel_class.desks d where d.school_id=scope and not exists(select 1 from pixel_class.desk_assignments a where a.desk_id=d.id) order by (d.id=previous) desc nulls last,d.y,d.x limit 1 for update skip locked;
 if chosen is null then
  select id into room from pixel_class.classrooms where school_id=scope order by id limit 1 for update;
  if room is null then raise exception 'classroom missing';end if;
  <<rows_loop>> for row_no in 0..39 loop
   foreach column_x in array array[300,535,770] loop
    if not exists(select 1 from pixel_class.desks d where d.school_id=scope and abs(d.x-column_x)<150 and abs(d.y-(307+row_no*180))<120) then
     chosen=gen_random_uuid()::text;
     insert into pixel_class.desks values(chosen,scope,room,column_x,307+row_no*180);
     update pixel_class.classrooms set height=greatest(height,307+row_no*180+213) where id=room;
     exit rows_loop;
    end if;
   end loop;
  end loop;
 end if;
 if chosen is null then raise exception 'classroom capacity exhausted';end if;
 insert into pixel_class.desk_assignments(school_id,profile_id,desk_id) values(scope,student,chosen) on conflict(school_id,profile_id) do update set desk_id=excluded.desk_id;
 return chosen;
end $$;
create function pixel_class.admit_student(scope text,student text,invite_hash text) returns text language plpgsql security invoker set search_path='' as $$
declare invitation text; assigned text;begin
 perform pg_advisory_xact_lock(hashtextextended(scope,0));
 select id into invitation from pixel_class.invitations where school_id=scope and key_hash=invite_hash and used_at is null and not revoked and expires_at>now() for update;
 if invitation is null then raise exception 'invalid or consumed invitation';end if;
 insert into pixel_class.school_memberships values(scope,student,'STUDENT','ACTIVE');
 assigned=pixel_private.assign_desk(scope,student);
 update pixel_class.invitations set used_at=now() where id=invitation;
 return assigned;
end $$;
create function pixel_class.change_membership(scope text,student text,actor text,next_status text,change_reason text,release_desk boolean default false) returns void language plpgsql security invoker set search_path='' as $$
declare previous text;begin
 perform pg_advisory_xact_lock(hashtextextended(scope,0));
 if next_status not in ('ACTIVE','ON_LEAVE','GRADUATED','REVOKED') or length(trim(change_reason))=0 then raise exception 'invalid status or reason';end if;
 if not exists(select 1 from pixel_class.school_memberships where school_id=scope and profile_id=actor and role='MASTER' and status='ACTIVE') then raise exception 'active MASTER required';end if;
 select status into previous from pixel_class.school_memberships where school_id=scope and profile_id=student and role='STUDENT' for update;
 if previous is null then raise exception 'student missing';end if;
 update pixel_class.school_memberships set status=next_status where school_id=scope and profile_id=student;
 if next_status in ('GRADUATED','REVOKED') or (next_status='ON_LEAVE' and release_desk) then
  update pixel_class.desk_assignments set previous_desk_id=coalesce(desk_id,previous_desk_id),desk_id=null where school_id=scope and profile_id=student;
 elsif next_status='ACTIVE' and not exists(select 1 from pixel_class.desk_assignments where school_id=scope and profile_id=student and desk_id is not null) then
  perform pixel_private.assign_desk(scope,student);
 end if;
 insert into pixel_class.membership_status_history values(gen_random_uuid()::text,scope,student,actor,previous,next_status,change_reason,now());
end $$;
revoke all on function pixel_private.assign_desk(text,text),pixel_class.admit_student(text,text,text),pixel_class.change_membership(text,text,text,text,text,boolean) from public,anon,authenticated;
grant execute on function pixel_private.assign_desk(text,text),pixel_class.admit_student(text,text,text),pixel_class.change_membership(text,text,text,text,text,boolean) to service_role;
commit;

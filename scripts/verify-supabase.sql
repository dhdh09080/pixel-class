-- Read-only catalog verification after applying to a fresh staging Supabase project.
-- Usage: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f scripts/verify-supabase.sql
begin read only;
do $$ declare missing integer;begin
 select count(*) into missing from pg_tables t join pg_class c on c.relname=t.tablename join pg_namespace n on n.oid=c.relnamespace and n.nspname=t.schemaname where t.schemaname='pixel_class' and not c.relrowsecurity;
 if missing<>0 then raise exception 'RLS is disabled on % tables',missing;end if;
 if to_regclass('pixel_class.school_memberships') is null or to_regclass('pixel_class.project_details') is null then raise exception 'required schema missing';end if;
 if has_table_privilege('anon','pixel_class.projects','SELECT') then raise exception 'anonymous project access';end if;
 if has_table_privilege('authenticated','pixel_class.school_memberships','UPDATE') then raise exception 'client role escalation possible';end if;
 if has_function_privilege('authenticated','pixel_class.admit_student(text,text,text)','EXECUTE') then raise exception 'admission RPC must be server only';end if;
end $$;
select schemaname,tablename,policyname,cmd from pg_policies where schemaname='pixel_class' order by tablename;
rollback;

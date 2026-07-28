-- Dione's packaged Supabase key is anonymous. Reset the exposed public schema
-- to the exact operations used by the desktop application, then expose a
-- read-only attestation RPC so release CI can prove the deployed state.

revoke all privileges on all tables in schema public from public, anon, authenticated;
revoke all privileges on all sequences in schema public from public, anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;
revoke all on schema public from public, anon, authenticated;

alter default privileges in schema public revoke all on tables from public, anon, authenticated;
alter default privileges in schema public revoke all on sequences from public, anon, authenticated;
alter default privileges revoke execute on functions from public, anon, authenticated;

-- Table-level REVOKE does not remove pre-existing column ACLs.
do $$
declare
	relation record;
	columns text;
begin
	for relation in
		select n.nspname, c.relname, c.oid
		from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
	loop
		select string_agg(format('%I', a.attname), ', ') into columns
		from pg_attribute a
		where a.attrelid = relation.oid and a.attnum > 0 and not a.attisdropped;
		if columns is not null then
			execute format(
				'revoke select (%s), insert (%s), update (%s), references (%s) on table %I.%I from public, anon, authenticated',
				columns, columns, columns, columns, relation.nspname, relation.relname
			);
		end if;
	end loop;
end;
$$;

alter table public.scripts enable row level security;
alter table public.scripts force row level security;
alter table public.reports enable row level security;
alter table public.reports force row level security;
alter table public.shared_urls enable row level security;
alter table public.shared_urls force row level security;

do $$
declare
	policy record;
begin
	for policy in
		select schemaname, tablename, policyname from pg_policies
		where schemaname = 'public' and tablename in ('scripts', 'reports', 'shared_urls')
	loop
		execute format('drop policy %I on %I.%I', policy.policyname, policy.schemaname, policy.tablename);
	end loop;
end;
$$;

create policy dione_scripts_anon_select
	on public.scripts for select to anon using (true);
create policy dione_reports_anon_insert
	on public.reports for insert to anon with check (true);
create policy dione_shared_urls_anon_select
	on public.shared_urls for select to anon using (true);
create policy dione_shared_urls_anon_insert
	on public.shared_urls for insert to anon with check (true);

grant usage on schema public to anon;
grant select on table public.scripts to anon;
grant insert on table public.reports to anon;
grant select, insert on table public.shared_urls to anon;

create or replace function public.dione_deployment_attestation()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $$
declare
	violations text[] := array[]::text[];
	relation record;
	routine record;
	role_name text;
	privilege_name text;
	allowed boolean;
	policy_count integer;
	canonical_oid oid;
begin
	-- Required relations must exist, enforce RLS even for owners, and expose only
	-- the operations used in the application to anon (none to authenticated).
	if to_regclass('public.scripts') is null then
		violations := array_append(violations, 'missing relation public.scripts');
	elsif not exists (
		select 1 from pg_class where oid = 'public.scripts'::regclass
			and relrowsecurity and relforcerowsecurity
	) then
		violations := array_append(violations, 'public.scripts must enable and force RLS');
	end if;
	if to_regclass('public.reports') is null then
		violations := array_append(violations, 'missing relation public.reports');
	elsif not exists (
		select 1 from pg_class where oid = 'public.reports'::regclass
			and relrowsecurity and relforcerowsecurity
	) then
		violations := array_append(violations, 'public.reports must enable and force RLS');
	end if;
	if to_regclass('public.shared_urls') is null then
		violations := array_append(violations, 'missing relation public.shared_urls');
	elsif not exists (
		select 1 from pg_class where oid = 'public.shared_urls'::regclass
			and relrowsecurity and relforcerowsecurity
	) then
		violations := array_append(violations, 'public.shared_urls must enable and force RLS');
	end if;

	for relation in
		select c.oid, c.relname
		from pg_class c
		join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm', 'f')
	loop
		foreach role_name in array array['anon', 'authenticated'] loop
			foreach privilege_name in array array['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER'] loop
				allowed := role_name = 'anon' and (
					(relation.relname = 'scripts' and privilege_name = 'SELECT') or
					(relation.relname = 'reports' and privilege_name = 'INSERT') or
					(relation.relname = 'shared_urls' and privilege_name in ('SELECT', 'INSERT'))
				);
				if has_table_privilege(role_name, relation.oid, privilege_name) is distinct from allowed then
					violations := array_append(violations, format('%s %s privilege differs for public.%I', role_name, privilege_name, relation.relname));
				end if;
				if privilege_name in ('SELECT', 'INSERT', 'UPDATE', 'REFERENCES') and not allowed
					and has_any_column_privilege(role_name, relation.oid, privilege_name) then
					violations := array_append(violations, format('%s has disallowed column %s on public.%I', role_name, privilege_name, relation.relname));
				end if;
			end loop;
		end loop;
	end loop;

	for relation in
		select c.oid, c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
		where n.nspname = 'public' and c.relkind = 'S'
	loop
		foreach role_name in array array['anon', 'authenticated'] loop
			foreach privilege_name in array array['USAGE', 'SELECT', 'UPDATE'] loop
				if has_sequence_privilege(role_name, relation.oid, privilege_name) then
					violations := array_append(violations, format('%s can %s sequence public.%I', role_name, privilege_name, relation.relname));
				end if;
			end loop;
		end loop;
	end loop;

	if not has_schema_privilege('anon', 'public', 'USAGE')
		or has_schema_privilege('anon', 'public', 'CREATE')
		or has_schema_privilege('authenticated', 'public', 'USAGE')
		or has_schema_privilege('authenticated', 'public', 'CREATE') then
		violations := array_append(violations, 'public schema client-role privileges differ from anon USAGE');
	end if;
	if exists (select 1 from pg_roles where rolname in ('anon', 'authenticated')
		and (rolsuper or rolcreaterole or rolcreatedb or rolbypassrls)) then
		violations := array_append(violations, 'client role has a privileged role attribute');
	end if;

	select count(*) into policy_count
	from pg_policies
	where schemaname = 'public' and tablename in ('scripts', 'reports', 'shared_urls');
	if policy_count <> 4 then
		violations := array_append(violations, 'catalog relations must have exactly four Dione policies');
	end if;
	if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'scripts'
		and policyname = 'dione_scripts_anon_select' and permissive = 'PERMISSIVE'
		and cmd = 'SELECT' and roles::text[] = array['anon'] and qual = 'true' and with_check is null) then
		violations := array_append(violations, 'scripts SELECT policy differs from deployment contract');
	end if;
	if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'reports'
		and policyname = 'dione_reports_anon_insert' and permissive = 'PERMISSIVE'
		and cmd = 'INSERT' and roles::text[] = array['anon'] and qual is null and with_check = 'true') then
		violations := array_append(violations, 'reports INSERT policy differs from deployment contract');
	end if;
	if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shared_urls'
		and policyname = 'dione_shared_urls_anon_select' and permissive = 'PERMISSIVE'
		and cmd = 'SELECT' and roles::text[] = array['anon'] and qual = 'true' and with_check is null) then
		violations := array_append(violations, 'shared_urls SELECT policy differs from deployment contract');
	end if;
	if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'shared_urls'
		and policyname = 'dione_shared_urls_anon_insert' and permissive = 'PERMISSIVE'
		and cmd = 'INSERT' and roles::text[] = array['anon'] and qual is null and with_check = 'true') then
		violations := array_append(violations, 'shared_urls INSERT policy differs from deployment contract');
	end if;

	canonical_oid := to_regprocedure('public.dione_deployment_attestation()');
	if canonical_oid is null or not exists (
		select 1 from pg_proc where oid = canonical_oid and prosecdef and pronargs = 0
			and proconfig @> array['search_path=pg_catalog']
	) or not has_function_privilege('anon', canonical_oid, 'EXECUTE')
		or has_function_privilege('authenticated', canonical_oid, 'EXECUTE') then
		violations := array_append(violations, 'deployment attestation RPC definition or grants differ');
	end if;
	for routine in
		select p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as arguments
		from pg_proc p join pg_namespace n on n.oid = p.pronamespace
		where n.nspname = 'public' and p.oid <> canonical_oid
	loop
		if has_function_privilege('anon', routine.oid, 'execute')
			or has_function_privilege('authenticated', routine.oid, 'execute') then
			violations := array_append(violations, format('client role can execute unexpected function public.%I(%s)', routine.proname, routine.arguments));
		end if;
	end loop;

	return jsonb_build_object(
		'contract_version', 1,
		'ok', cardinality(violations) = 0,
		'violations', to_jsonb(violations)
	);
end;
$$;

revoke all on function public.dione_deployment_attestation() from public, authenticated;
grant execute on function public.dione_deployment_attestation() to anon;

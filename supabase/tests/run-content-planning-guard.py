#!/usr/bin/env python3
"""Synthetic normal-server rehearsal of the pinned first-application wrapper."""
import hashlib
import json
import os
from pathlib import Path
import subprocess
import tempfile
import time

ROOT = Path(__file__).resolve().parents[2]
GUARD = ROOT / 'supabase/tests/migration-guard'
MIGRATION = ROOT / 'supabase/content-planning.sql'
URL = os.environ['FIREOVA_TEST_DATABASE_URL']
ENV = dict(os.environ, PGOPTIONS='-c timezone=UTC -c search_path=pg_catalog,public,extensions')
BASE = [os.environ.get('PSQL', 'psql'), URL, '-X', '-q', '-A', '-t', '-v', 'ON_ERROR_STOP=1', '-v', 'VERBOSITY=verbose']
PIN = '3886b300a9c7f11811a1ebb020b28f3f5e2ccb33595811d11cd6f3a887300fa8'
assert hashlib.sha256(MIGRATION.read_bytes()).hexdigest() == PIN


def sql(text, owner='postgres', check=True):
    result = subprocess.run(BASE + ['-c', 'set role ' + owner, '-c', text], env=ENV, text=True, capture_output=True, timeout=90)
    if check and result.returncode:
        raise AssertionError(result.stdout + result.stderr)
    return result


assert sql('select current_database()').stdout.strip() == 'fireova_content_planning_test', 'Refusing non-test database'


def run_file(path, owner='postgres'):
    return subprocess.run(BASE + ['-c', 'set role ' + owner, '-f', str(path)], env=ENV, text=True, capture_output=True, timeout=90)


def fixture(owner):
    result = subprocess.run(BASE + ['-v', 'migration_owner=' + owner, '-f', str(ROOT / 'supabase/tests/content-planning-fixture.sql')], env=ENV, text=True, capture_output=True, timeout=90)
    assert result.returncode == 0, result.stdout + result.stderr


def snapshot(owner):
    result = run_file(GUARD / 'snapshot-query.sql', owner)
    assert result.returncode == 0, result.stdout + result.stderr
    return json.loads(result.stdout)


def no_planning_objects():
    result = sql("""select to_regclass('public.content_plan_slots') is null
      and not exists(select 1 from pg_attribute where attrelid='public.posts'::regclass and not attisdropped and attname in ('source_draft_id','plan_slot_id','planning_date','plan_position'))
      and not exists(select 1 from pg_proc where pronamespace='public'::regnamespace and proname in ('content_plan_asset_key','content_plan_date','normalize_review_queue_slots','restore_review_queue_identity','protect_review_queue_planning','mark_deleted_approved_slot_removed','save_review_queue_with_plan','approve_review_draft'))""")
    assert result.stdout.strip() == 't', 'Planning DDL survived a rejected transaction'


def start_holder(kind, work):
    name = 'fireova_guard_' + kind + '_holder'
    log = open(work / (kind + '-holder.log'), 'w')
    statement = "update public.posts set title=title where id=(select id from public.posts order by id limit 1)" if kind == 'writer' else 'select pg_advisory_xact_lock(78190317)'
    proc = subprocess.Popen(BASE, env=dict(ENV, PGAPPNAME=name), stdin=subprocess.PIPE, stdout=log, stderr=log, text=True)
    proc.stdin.write('begin;\n' + statement + ';\nselect pg_sleep(60);\nrollback;\n')
    proc.stdin.close()
    predicate = "l.relation='public.posts'::regclass and l.mode='RowExclusiveLock'" if kind == 'writer' else "l.locktype='advisory'"
    for _ in range(100):
        found = sql("select count(*) from pg_locks l join pg_stat_activity a on a.pid=l.pid where a.application_name='" + name + "' and l.granted and " + predicate).stdout.strip()
        if found == '1':
            return proc, log, name
        assert proc.poll() is None, (work / (kind + '-holder.log')).read_text()
        time.sleep(.05)
    raise AssertionError('Holder failed to acquire its observed lock')


def stop_holder(holder):
    if holder:
        proc, log, name = holder
        sql("select pg_terminate_backend(pid) from pg_stat_activity where application_name='" + name + "'")
        proc.wait(timeout=10)
        log.close()


CASES = ['success', 'stale_record', 'stale_schema', 'writer_nowait', 'postcondition', 'statement_timeout', 'transaction_timeout', 'idle_timeout', 'lock_timeout']
for owner in ['postgres', 'supabase_admin']:
    for case in CASES:
        with tempfile.TemporaryDirectory(prefix='fireova-guard-') as temp:
            work = Path(temp)
            fixture(owner)
            expected = snapshot(owner)
            (work / 'expected.json').write_text(json.dumps(expected))
            wrapper = work / 'wrapper.sql'
            rendered = subprocess.run(['python3', str(GUARD / 'render.py'), '--migration', str(MIGRATION), '--expected', str(work / 'expected.json'), '--output', str(wrapper)], text=True, capture_output=True, check=True)
            assert json.loads(rendered.stdout)['body_unchanged'] is True
            original_wrapper = wrapper.read_text()
            holder = None
            marker = 'do $fireova_preservation$'
            assert original_wrapper.count(marker) == 1
            code = original_wrapper
            if case == 'stale_record':
                sql("update public.posts set title=title||' changed' where id=(select id from public.posts order by id limit 1)")
            elif case == 'stale_schema':
                sql('alter table public.posts add column synthetic_guard_drift text')
            elif case == 'writer_nowait':
                holder = start_holder('writer', work)
            elif case == 'postcondition':
                code = code.replace(marker, "update public.posts set title=title||' test-only corruption';\n" + marker, 1)
            elif case == 'statement_timeout':
                code = code.replace("set local statement_timeout = '30s';", "set local statement_timeout = '1s';")
                code = code.replace(marker, 'select pg_sleep(5);\n' + marker, 1)
            elif case == 'transaction_timeout':
                code = code.replace("set local transaction_timeout = '60s';", "set local transaction_timeout = '1s';").replace("set local statement_timeout = '30s';", "set local statement_timeout = '0';").replace("set local idle_in_transaction_session_timeout = '15s';", "set local idle_in_transaction_session_timeout = '0';")
                code = code.replace(marker, 'select pg_sleep(5);\n' + marker, 1)
            elif case == 'idle_timeout':
                code = code.replace("set local idle_in_transaction_session_timeout = '15s';", "set local idle_in_transaction_session_timeout = '1s';")
                code = code.replace(marker, '\\! sleep 3\n' + marker, 1)
            elif case == 'lock_timeout':
                holder = start_holder('advisory', work)
                code = code.replace("set local lock_timeout = '2s';", "set local lock_timeout = '1s';")
                code = code.replace(marker, 'select pg_advisory_xact_lock(78190317);\n' + marker, 1)
            # Fault copies only add controlled failures/reduce timeout settings;
            # the success and precondition/NOWAIT cases use the exact renderer output.
            wrapper.write_text(code)
            before = snapshot(owner)
            try:
                started = time.monotonic()
                result = run_file(wrapper, owner)
                duration = time.monotonic() - started
            finally:
                stop_holder(holder)
            if case == 'success':
                assert result.returncode == 0, result.stdout + result.stderr
                assert sql('select count(*) from public.content_plan_slots').stdout.strip() == '6'
                # A second first-application wrapper must refuse an installed schema.
                installed = snapshot(owner)
                (work / 'installed.json').write_text(json.dumps(installed))
                subprocess.run(['python3', str(GUARD / 'render.py'), '--migration', str(MIGRATION), '--expected', str(work / 'installed.json'), '--output', str(work / 'repeat.sql')], check=True, capture_output=True)
                repeat = run_file(work / 'repeat.sql', owner)
                assert repeat.returncode != 0 and 'first-application assumptions failed' in repeat.stderr, repeat.stdout + repeat.stderr
                assert snapshot(owner) == installed, 'Rejected repeat changed existing migrated state'
            else:
                assert result.returncode != 0, 'Expected rejection for ' + case
                expected_error = {
                    'stale_record': 'precondition failed', 'stale_schema': 'precondition failed',
                    'writer_nowait': '55P03', 'postcondition': 'preservation check failed',
                    'statement_timeout': 'statement timeout', 'transaction_timeout': 'transaction timeout',
                    'idle_timeout': 'idle-in-transaction timeout', 'lock_timeout': 'lock timeout'
                }[case]
                assert expected_error in result.stderr, result.stdout + result.stderr
                if case == 'writer_nowait':
                    assert duration < 2, 'NOWAIT rejection unexpectedly waited'
                assert snapshot(owner) == before, 'Failed wrapper changed protected rows/schema/access: ' + case
                no_planning_objects()
            print(f'PASS guard {owner} {case} ({duration:.2f}s)', flush=True)
print('content planning guarded migration rehearsal passed for both owners', flush=True)

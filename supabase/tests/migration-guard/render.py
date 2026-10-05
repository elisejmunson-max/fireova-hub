#!/usr/bin/env python3
"""Render a private, one-shot first-application guard around a pinned migration."""
import argparse, hashlib, json
from pathlib import Path
PIN = '3886b300a9c7f11811a1ebb020b28f3f5e2ccb33595811d11cd6f3a887300fa8'
p=argparse.ArgumentParser()
p.add_argument('--migration', type=Path, required=True)
p.add_argument('--expected', type=Path, required=True)
p.add_argument('--output', type=Path, required=True)
a=p.parse_args()
raw=a.migration.read_bytes()
assert hashlib.sha256(raw).hexdigest()==PIN, 'Migration source hash differs'
src=raw.decode()
assert src.count('\nbegin;\n')==1 and src.endswith('commit;\n'), 'Unexpected transaction structure'
expected=json.loads(a.expected.read_text())
assert set(expected)=={'database','role','version_major','records','schema'}, 'Wrong snapshot shape'
assert expected['version_major']==17
assert set(expected['records'])=={'posts','media_assets','post_media','review_queue','review_feedback'}
assert all(isinstance(x,str) and len(x)==32 and all(c in '0123456789abcdef' for c in x) for x in expected['records'].values())
base=Path(__file__).resolve().parent
query=(base/'snapshot-query.sql').read_text().strip().removesuffix(';')
pre=(base/'guard-pre.sql').read_text()
pre=pre.replace('-- EXPECTED_CONFIGURATION', "set local fireova_migration.expected = '"+json.dumps(expected,ensure_ascii=False,separators=(',',':')).replace("'","''")+"';")
# SELECT expression becomes a single-row SELECT INTO within the PL/pgSQL block.
pre=pre.replace('-- SNAPSHOT_QUERY', 'select snapshot.value into actual from (\n'+query+' as value\n) snapshot;')
post=(base/'guard-post.sql').read_text()
out=src.replace('\nbegin;\n','\nbegin;\n'+pre,1)
out=out[:-len('commit;\n')]+post+'commit;\n'
# Removal of both inserted blocks reconstructs the reviewed migration byte for byte.
recovered=out.replace(pre,'',1).replace(post,'',1)
assert recovered.encode()==raw
assert '-- SNAPSHOT_QUERY' not in out and '-- EXPECTED_CONFIGURATION' not in out
a.output.write_text(out)
a.output.chmod(0o600)
print(json.dumps({'migration_sha256':PIN,'wrapper_sha256':hashlib.sha256(out.encode()).hexdigest(),'output':str(a.output),'body_unchanged':True}))

from contextlib import closing
"""Offline operator utility. Never opens HTTP, never writes the source database."""
import argparse
import base64
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import time


def quote(name):
    return '"' + name.replace('"', '""') + '"'


def snapshot(source, destination):
    source, destination = Path(source).resolve(strict=True), Path(destination).resolve()
    if source == destination:
        raise ValueError('Source and destination must differ')
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Reserve a new file: never replace any existing backup or source.
    fd = os.open(destination, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    os.close(fd)
    with closing(sqlite3.connect(source.as_uri() + '?mode=ro', uri=True, timeout=10)) as src:
        with closing(sqlite3.connect(destination)) as dst:
            started = time.monotonic()
            def progress(status, remaining, total):
                if time.monotonic() - started > 60:
                    raise TimeoutError('Snapshot deadline exceeded; artifact is not verified')
            src.backup(dst, pages=128, sleep=0.01, progress=progress)
    with closing(sqlite3.connect(destination.as_uri() + '?mode=ro', uri=True)) as db:
        db.row_factory = sqlite3.Row
        if [r[0] for r in db.execute('PRAGMA integrity_check')] != ['ok']:
            raise ValueError('Integrity check failed; do not use this artifact')
        if list(db.execute('PRAGMA foreign_key_check')):
            raise ValueError('Foreign key check failed; do not use this artifact')
        catalog = [dict(r) for r in db.execute("SELECT type,name,tbl_name,sql FROM sqlite_master ORDER BY type,name")]
        tables = {}
        for record in catalog:
            if record['type'] != 'table' or record['name'].startswith('sqlite_'):
                continue
            table = record['name']
            rows = []
            for row in db.execute('SELECT * FROM ' + quote(table)):
                rows.append({k: {'__sqlite_blob_base64': base64.b64encode(v).decode('ascii')} if isinstance(v, bytes) else v for k,v in dict(row).items()})
            tables[table] = {'columns': [dict(r) for r in db.execute('PRAGMA table_info(' + quote(table) + ')')], 'rows': rows}
    manifest = {'kind':'eventgrid-sqlite-online-backup-v1','completeSqliteFile':True,'sha256':hashlib.sha256(destination.read_bytes()).hexdigest(),'catalog':catalog,'tables':tables}
    manifest_path = Path(str(destination) + '.manifest.json')
    fd = os.open(manifest_path, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
    with os.fdopen(fd, 'w', encoding='utf-8') as out:
        json.dump(manifest, out, ensure_ascii=False)
    Path(str(manifest_path) + '.sha256').write_text(hashlib.sha256(manifest_path.read_bytes()).hexdigest(), encoding='ascii')
    return {'tables':len(tables),'rows':sum(len(t['rows']) for t in tables.values()),'sha256':manifest['sha256'],'manifest':str(manifest_path)}


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('source',type=Path)
    parser.add_argument('destination',type=Path)
    args = parser.parse_args()
    print(json.dumps(snapshot(args.source,args.destination)))

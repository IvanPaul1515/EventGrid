from contextlib import closing
import importlib.util
from pathlib import Path
import sqlite3
import tempfile
import unittest

spec=importlib.util.spec_from_file_location('snapshot',Path(__file__).with_name('sqlite_snapshot.py'))
m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)

class OnlineSnapshotTests(unittest.TestCase):
    def test_wal_committed_rows_and_hidden_state_are_preserved(self):
        with tempfile.TemporaryDirectory(prefix='eventgrid-snapshot-') as tmp:
            source=Path(tmp)/'live.db';target=Path(tmp)/'copy.db'
            with closing(sqlite3.connect(source)) as writer:
                writer.executescript('PRAGMA journal_mode=WAL; CREATE TABLE users(id TEXT PRIMARY KEY,hash TEXT); CREATE TABLE registration_sequences(eventId TEXT PRIMARY KEY,current INTEGER); INSERT INTO users VALUES ("qa","opaque-hash"); INSERT INTO registration_sequences VALUES ("event",120);')
                writer.commit()
                writer.execute('INSERT INTO users VALUES ("uncommitted","never-copy")')
                result=m.snapshot(source,target)
                self.assertEqual(result['tables'],2)
                with closing(sqlite3.connect(target)) as restored:
                    self.assertEqual(restored.execute('SELECT * FROM users').fetchall(),[('qa','opaque-hash')])
                    self.assertEqual(restored.execute('SELECT current FROM registration_sequences').fetchone()[0],120)
                writer.rollback()
    def test_refuses_overwrite_and_source_is_unchanged(self):
        with tempfile.TemporaryDirectory(prefix='eventgrid-snapshot-') as tmp:
            source=Path(tmp)/'live.db';target=Path(tmp)/'copy.db'
            with closing(sqlite3.connect(source)) as db:db.execute('CREATE TABLE data(id INTEGER)')
            before=source.read_bytes();target.write_bytes(b'keep')
            with self.assertRaises(FileExistsError):m.snapshot(source,target)
            with self.assertRaises(ValueError):m.snapshot(source,source)
            self.assertEqual(target.read_bytes(),b'keep');self.assertEqual(source.read_bytes(),before)
    def test_rejects_an_inconsistent_source(self):
        with tempfile.TemporaryDirectory(prefix='eventgrid-snapshot-') as tmp:
            source=Path(tmp)/'broken.db'
            with closing(sqlite3.connect(source)) as db:db.executescript('CREATE TABLE parent(id INTEGER PRIMARY KEY); CREATE TABLE child(parentId INTEGER REFERENCES parent(id)); INSERT INTO child VALUES(999);')
            with self.assertRaises(ValueError):m.snapshot(source,Path(tmp)/'copy.db')
            self.assertFalse(Path(tmp,'copy.db.manifest.json').exists())

if __name__=='__main__':unittest.main()

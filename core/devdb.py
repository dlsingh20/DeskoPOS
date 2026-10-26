"""Embedded PostgreSQL for development and tests (no local install needed)."""
import shutil
from pathlib import Path


def _ensure_timezones():
    """
    pgserver's Windows build ships without PostgreSQL's time zone files, so
    `SET TIME ZONE 'UTC'` fails. The tzdata package has the same files.
    """
    import pgserver
    target = Path(pgserver.__file__).parent / 'pginstall' / 'share' / 'postgresql' / 'timezone'
    if target.exists():
        return
    import tzdata
    shutil.copytree(Path(tzdata.__file__).parent / 'zoneinfo', target,
                    ignore=shutil.ignore_patterns('__init__.py', '__pycache__', '*.py', '*.pyc'))


def embedded_database_url(data_dir: Path) -> str:
    import pgserver
    import psycopg

    _ensure_timezones()
    data_dir.mkdir(parents=True, exist_ok=True)
    server = pgserver.get_server(str(data_dir), cleanup_mode=None)
    with psycopg.connect(server.get_uri(), autocommit=True) as conn:
        if not conn.execute("SELECT 1 FROM pg_database WHERE datname = 'pos'").fetchone():
            conn.execute('CREATE DATABASE pos')
    return server.get_uri().rsplit('/', 1)[0] + '/pos'

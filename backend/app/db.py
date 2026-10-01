from contextlib import contextmanager

import psycopg
from psycopg.rows import dict_row

from app.config import settings
from app.errors import fail


@contextmanager
def connection():
    url = settings().database_url.get_secret_value()
    if not url:
        fail(503, "database_not_configured", "Configure DATABASE_URL and apply the migrations.")
    # Supavisor transaction pooling does not support prepared statements.
    with psycopg.connect(url, row_factory=dict_row, prepare_threshold=None, connect_timeout=5) as db:
        db.execute("set local statement_timeout = '10s'")
        yield db


def user_id(auth0_sub: str):
    with connection() as db:
        return db.execute(
            "insert into app.users(auth0_sub) values (%s) on conflict(auth0_sub) "
            "do update set auth0_sub=excluded.auth0_sub returning id", (auth0_sub,),
        ).fetchone()["id"]


def owned(db, meeting_id, owner_id, *, lock=False):
    query = "select * from app.meetings where id=%s and owner_id=%s and deleted_at is null"
    row = db.execute(query + (" for update" if lock else ""), (meeting_id, owner_id)).fetchone()
    if row is None:
        fail(404, "meeting_not_found", "Meeting not found.")
    return row

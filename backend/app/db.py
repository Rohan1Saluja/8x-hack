import os
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
    tls = (
        {"sslmode": "require"} if settings().app_env == "production" or os.getenv("VERCEL") else {}
    )
    with psycopg.connect(
        url, row_factory=dict_row, prepare_threshold=None, connect_timeout=5, **tls
    ) as db:
        db.execute("set local statement_timeout = '10s'")
        yield db

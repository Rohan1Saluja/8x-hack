import os
from contextlib import contextmanager
from threading import Lock

from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool

from app.config import settings
from app.errors import fail

_pool = None
_pool_lock = Lock()


def pool():
    global _pool
    with _pool_lock:
        if _pool is None:
            url = settings().database_url.get_secret_value()
            if not url:
                fail(
                    503,
                    "database_not_configured",
                    "Configure DATABASE_URL and apply the migrations.",
                )
            tls = (
                {"sslmode": "require"}
                if settings().app_env == "production" or os.getenv("VERCEL")
                else {}
            )
            _pool = ConnectionPool(
                url,
                kwargs={
                    "row_factory": dict_row,
                    "prepare_threshold": None,
                    "connect_timeout": 5,
                    **tls,
                },
                min_size=0,
                max_size=4,
                max_idle=60,
                timeout=5,
                check=ConnectionPool.check_connection,
                open=True,
            )
        return _pool


def close_pool():
    global _pool
    with _pool_lock:
        if _pool is not None:
            _pool.close()
            _pool = None


@contextmanager
def connection():
    # Reuse connections within a warm instance; preserve commit/rollback boundaries.
    # Prepared statements remain disabled for Supavisor transaction pooling.
    with pool().connection() as conn:
        conn.execute("set local statement_timeout = '10s'")
        yield conn

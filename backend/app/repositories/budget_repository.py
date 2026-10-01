def lock_approval(conn):
    return conn.execute("select pg_advisory_xact_lock(88001)")


def lock_budget(conn):
    return conn.execute(
        "select * from app.provider_budget where provider='groq' for update"
    ).fetchone()


def approve(conn, *, verified_at, expires_at, note, audio_limit, request_limit, token_limit):
    return conn.execute(
        "insert into app.provider_budget(provider,verified_at,expires_at,verification_note,audio_limit,request_limit,token_limit) values('groq',%s,%s,%s,%s,%s,%s) on conflict(provider) do update set verified_at=excluded.verified_at,expires_at=excluded.expires_at,verification_note=excluded.verification_note,audio_limit=excluded.audio_limit,request_limit=excluded.request_limit,token_limit=excluded.token_limit",
        (verified_at, expires_at, note, audio_limit, request_limit, token_limit),
    )

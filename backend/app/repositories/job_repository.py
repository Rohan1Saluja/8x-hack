STAGE_COLUMN = {"transcribe": "transcription_state", "summarize": "summary_state"}


def lock_budget(conn):
    return conn.execute(
        "select * from app.provider_budget where provider='groq' for update"
    ).fetchone()


def lock_job(conn, job_key, meeting_id):
    return conn.execute(
        "select * from app.processing_jobs where meeting_id=%s and job_key=%s for update",
        (meeting_id, job_key),
    ).fetchone()


def count_questions(conn, meeting_id):
    return conn.execute(
        "select count(*) as count from app.processing_jobs where meeting_id=%s and stage='question'",
        (meeting_id,),
    ).fetchone()


def reserve_budget(conn, audio, lease, text_requests, tokens):
    return conn.execute(
        "update app.provider_budget set audio_reserved=audio_reserved+%s, requests_reserved=requests_reserved+%s, tokens_reserved=tokens_reserved+%s,active_token=%s,active_until=now()+interval '5 minutes' where provider='groq'",
        (audio, text_requests, tokens, lease),
    )


def start_job(conn, fingerprint, job_key, lease, meeting_id, stage):
    return conn.execute(
        "insert into app.processing_jobs(meeting_id,job_key,stage,status,attempts,input_hash,lease_token,lease_until) values(%s,%s,%s,'running',1,%s,%s,now()+interval '5 minutes') on conflict(meeting_id,job_key) do update set status='running',attempts=app.processing_jobs.attempts+1,lease_token=excluded.lease_token,lease_until=excluded.lease_until,error_code=null,retry_after=null",
        (meeting_id, job_key, stage, fingerprint, lease),
    )


def mark_running(conn, meeting_id, stage):
    return conn.execute(
        f"update app.meetings set {STAGE_COLUMN[stage]}='running',failure_code=null where id=%s",
        (meeting_id,),
    )


def lock_budget_for_completion(conn):
    return conn.execute("select provider from app.provider_budget where provider='groq' for update")


def lock_meeting(conn, meeting_id):
    return conn.execute("select id from app.meetings where id=%s for update", (meeting_id,))


def finish_job(conn, error, job_key, lease, meeting_id):
    return conn.execute(
        "update app.processing_jobs set status=%s,error_code=%s,retry_after=case when %s then now()+interval '60 seconds' else null end where meeting_id=%s and job_key=%s and lease_token=%s and status='running' returning stage",
        ("failed" if error else "ready", error, bool(error), meeting_id, job_key, lease),
    ).fetchone()


def finish_stage(conn, error, meeting_id, stage):
    return conn.execute(
        f"update app.meetings set {STAGE_COLUMN[stage]}=%s,failure_code=%s where id=%s",
        ("failed" if error else "ready", error, meeting_id),
    )


def release_budget(conn, lease):
    return conn.execute(
        "update app.provider_budget set active_token=null,active_until=null where provider='groq' and active_token=%s",
        (lease,),
    )


def recover_expired(conn, meeting_id):
    return conn.execute(
        "update app.processing_jobs set status='failed',error_code='interrupted',retry_after=null where meeting_id=%s and status='running' and lease_until<now() returning stage",
        (meeting_id,),
    ).fetchall()


def mark_interrupted(conn, meeting_id, stage):
    return conn.execute(
        f"update app.meetings set {STAGE_COLUMN[stage]}='failed',failure_code='interrupted' where id=%s",
        (meeting_id,),
    )

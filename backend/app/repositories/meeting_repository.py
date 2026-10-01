def find_owned(conn, meeting_id, owner, *, lock=False):
    query = "select * from app.meetings where id=%s and owner_id=%s and deleted_at is null"
    return conn.execute(query + (" for update" if lock else ""), (meeting_id, owner)).fetchone()


def list_owned(conn, owner):
    return conn.execute(
        "select * from app.meetings where owner_id=%s and deleted_at is null order by created_at desc limit 100",
        (owner,),
    ).fetchall()


def create(conn, meeting_url, owner, request_id, title):
    return conn.execute(
        "insert into app.meetings(owner_id,title,meeting_url,request_id) values(%s,%s,%s,%s) on conflict(owner_id,request_id) do nothing returning *",
        (owner, title, meeting_url, request_id),
    ).fetchone()


def find_by_request(conn, owner, request_id):
    return conn.execute(
        "select * from app.meetings where owner_id=%s and request_id=%s and deleted_at is null",
        (owner, request_id),
    ).fetchone()


def has_running_job(conn, meeting_id):
    return conn.execute(
        "select 1 from app.processing_jobs where meeting_id=%s and status='running' limit 1",
        (meeting_id,),
    ).fetchone()


def delete_owned(conn, meeting_id, owner):
    return conn.execute("delete from app.meetings where id=%s and owner_id=%s", (meeting_id, owner))


def find_for_local_import(conn, meeting_id):
    return conn.execute(
        "select * from app.meetings where id=%s and deleted_at is null for update", (meeting_id,)
    ).fetchone()


def attach_local_recording(conn, meeting_id, key, size, duration):
    conn.execute(
        "update app.meetings set recording_key=%s, recording_bytes=%s, duration_seconds=%s, "
        "capture_state='stopped', failure_code=null where id=%s",
        (key, size, duration, meeting_id),
    )

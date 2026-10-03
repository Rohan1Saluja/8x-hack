from uuid import UUID

from psycopg.types.json import Jsonb


def list_segments(conn, meeting_id):
    return conn.execute(
        "select id,ordinal,text,start_seconds,end_seconds,speaker from app.transcript_segments where meeting_id=%s order by ordinal",
        (meeting_id,),
    ).fetchall()


def get_budget_status(conn):
    return conn.execute(
        "select expires_at,expires_at>now() as verified,audio_limit-audio_reserved as audio_seconds_remaining,request_limit-requests_reserved as text_requests_remaining,token_limit-tokens_reserved as text_tokens_remaining from app.provider_budget where provider='groq'"
    ).fetchone()


def get_summary(conn, meeting_id):
    return conn.execute(
        "select content from app.summaries where meeting_id=%s", (meeting_id,)
    ).fetchone()


def list_actions(conn, meeting_id):
    return conn.execute(
        "select id,text,owner,due_date,completed,source_segment_ids from app.action_items where meeting_id=%s order by created_at,id",
        (meeting_id,),
    ).fetchall()


def list_questions(conn, meeting_id):
    return conn.execute(
        "select id,question,answer,created_at,model='scripted-demo-not-ai' as is_sample from app.questions where meeting_id=%s order by created_at",
        (meeting_id,),
    ).fetchall()


def list_jobs(conn, meeting_id):
    return conn.execute(
        "select job_key,stage,status,attempts,error_code,retry_after,lease_until,status='running' and lease_until<now() as interrupted from app.processing_jobs where meeting_id=%s order by job_key",
        (meeting_id,),
    ).fetchall()


def update_action(conn, action_id, action_owner, completed, due_date, meeting_id, text):
    return conn.execute(
        "update app.action_items set text=%s,owner=%s,due_date=%s,completed=%s where meeting_id=%s and id=%s returning id,text,owner,due_date,completed,source_segment_ids",
        (text, action_owner, due_date, completed, meeting_id, action_id),
    ).fetchone()


def insert_segment(conn, meeting_id, segment):
    return conn.execute(
        "insert into app.transcript_segments(id,meeting_id,ordinal,text,start_seconds,end_seconds,speaker) values(%s,%s,%s,%s,%s,%s,null)",
        (
            segment.id,
            meeting_id,
            segment.ordinal,
            segment.text,
            segment.start_seconds,
            segment.end_seconds,
        ),
    )


def insert_summary(conn, meeting_id, model, summary):
    return conn.execute(
        "insert into app.summaries(meeting_id,content,model) values(%s,%s,%s)",
        (meeting_id, Jsonb(summary.model_dump(exclude={"action_items"})), model),
    )


def insert_action(conn, action, meeting_id):
    return conn.execute(
        "insert into app.action_items(meeting_id,text,owner,due_date,source_segment_ids) values(%s,%s,%s,%s,%s)",
        (
            meeting_id,
            action.text,
            action.owner,
            action.due_date,
            [UUID(s) for s in action.source_segment_ids],
        ),
    )


def find_question(conn, meeting_id, request_id):
    return conn.execute(
        "select question,answer from app.questions where meeting_id=%s and request_id=%s",
        (meeting_id, request_id),
    ).fetchone()


def get_answer(conn, meeting_id, request_id):
    return conn.execute(
        "select answer from app.questions where meeting_id=%s and request_id=%s",
        (meeting_id, request_id),
    ).fetchone()


def insert_question(conn, answer, meeting_id, model, question, request_id):
    return conn.execute(
        "insert into app.questions(meeting_id,request_id,question,answer,model) values(%s,%s,%s,%s,%s)",
        (meeting_id, request_id, question, Jsonb(answer.model_dump()), model),
    )

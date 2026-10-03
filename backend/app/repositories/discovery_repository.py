"""Owner-filtered, parameterized search and exact transcript bookmarks."""

LIST_HIGHLIGHTS_SQL = "select h.id,h.segment_id,s.text,s.start_seconds,s.end_seconds from app.highlights h join app.transcript_segments s on s.id=h.segment_id and s.meeting_id=h.meeting_id where h.meeting_id=%s order by s.start_seconds,h.id"


def search(conn, owner, query):
    # Literal substring matching supports partial names without LIKE wildcard injection.
    # Bound output and source text; no recording keys or URLs leave this query.
    return conn.execute(
        """
        with owned as (
          select id,title,created_at from app.meetings where owner_id=%s and deleted_at is null
        ), documents as (
          select id as meeting_id,'title' as kind,title as text,null::uuid as segment_id,
                 null::double precision as start_seconds from owned
          union all
          select s.meeting_id,'transcript',s.text,s.id,s.start_seconds
            from app.transcript_segments s join owned o on o.id=s.meeting_id
          union all
          select s.meeting_id,'summary',s.content->'overview'->>'text',null::uuid,null::double precision
            from app.summaries s join owned o on o.id=s.meeting_id
          union all
          select s.meeting_id,'decision',d->>'text',t.id,t.start_seconds
            from app.summaries s join owned o on o.id=s.meeting_id
            cross join lateral jsonb_array_elements(s.content->'decisions') d
            left join app.transcript_segments t on t.meeting_id=s.meeting_id and t.id::text=d->'source_segment_ids'->>0
          union all
          select a.meeting_id,'action',a.text,t.id,t.start_seconds
            from app.action_items a join owned o on o.id=a.meeting_id
            left join app.transcript_segments t on t.meeting_id=a.meeting_id and t.id=a.source_segment_ids[1]
        ), matches as (
          select d.*,o.title,o.created_at,strpos(lower(d.text),lower(%s)) as pos
          from documents d join owned o on o.id=d.meeting_id
        ) , selected_meetings as (
          select meeting_id,max(created_at) as created_at from matches where pos>0
          group by meeting_id order by created_at desc,meeting_id limit 20
        ), ranked as (
          select *,row_number() over(partition by meeting_id order by
            case kind when 'transcript' then 0 else 1 end,start_seconds nulls last,kind,text) as rank
          from matches where pos>0
        )
        select meeting_id,title,kind,substring(text from greatest(1,pos-65) for 240) as snippet,
               segment_id,start_seconds from ranked where rank<=4 and meeting_id in (select meeting_id from selected_meetings)
        order by created_at desc,meeting_id,rank limit 80
        """,
        (owner, query),
    ).fetchall()


def list_highlights(conn, meeting_id):
    return conn.execute(
        LIST_HIGHLIGHTS_SQL,
        (meeting_id,),
    ).fetchall()


def save_highlight(conn, meeting_id, segment_id):
    return conn.execute(
        "insert into app.highlights(meeting_id,segment_id) "
        "select meeting_id,id from app.transcript_segments where meeting_id=%s and id=%s "
        "on conflict(meeting_id,segment_id) do update set segment_id=excluded.segment_id returning id",
        (meeting_id, segment_id),
    ).fetchone()


def delete_highlight(conn, meeting_id, highlight_id):
    return conn.execute(
        "delete from app.highlights where meeting_id=%s and id=%s returning id",
        (meeting_id, highlight_id),
    ).fetchone()

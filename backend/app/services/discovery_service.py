from app import db
from app.errors import fail
from app.repositories import discovery_repository as repository
from app.services.meeting_service import require_owned


def search(owner, query):
    query = query.strip()
    if len(query) < 2:
        return []
    with db.connection() as conn:
        return repository.search(conn, owner, query)


def save_highlight(meeting_id, segment_id, owner):
    with db.connection() as conn:
        require_owned(conn, meeting_id, owner, lock=True)
        row = repository.save_highlight(conn, meeting_id, segment_id)
        if row is None:
            fail(404, "segment_not_found", "Transcript moment not found in this meeting.")
    return row


def delete_highlight(meeting_id, highlight_id, owner):
    with db.connection() as conn:
        require_owned(conn, meeting_id, owner, lock=True)
        if repository.delete_highlight(conn, meeting_id, highlight_id) is None:
            fail(404, "highlight_not_found", "Highlight not found.")

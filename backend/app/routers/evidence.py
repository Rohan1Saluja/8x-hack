from uuid import UUID

from fastapi import APIRouter, Depends, Query

from app.evidence_schemas import ActionUpdate, HighlightCreate, QuestionCreate
from app.routers.dependencies import current_user
from app.services import demo_service, discovery_service, evidence_service

router = APIRouter()


@router.get("/integrations")
def integrations(owner=Depends(current_user)):
    return evidence_service.integrations(owner)


@router.get("/meetings/{meeting_id}/evidence")
def get_evidence(meeting_id: UUID, owner=Depends(current_user)):
    return evidence_service.get_evidence(meeting_id, owner)


@router.patch("/meetings/{meeting_id}/actions/{action_id}")
def update_action(
    meeting_id: UUID, action_id: UUID, body: ActionUpdate, owner=Depends(current_user)
):
    return evidence_service.update_action(meeting_id, action_id, body, owner)


@router.post("/meetings/{meeting_id}/recover")
def recover_processing(meeting_id: UUID, owner=Depends(current_user)):
    return evidence_service.recover_processing(meeting_id, owner)


@router.post("/meetings/{meeting_id}/transcribe")
def transcribe(meeting_id: UUID, owner=Depends(current_user)):
    return evidence_service.transcribe(meeting_id, owner)


@router.post("/meetings/{meeting_id}/summarize")
def summarize(meeting_id: UUID, owner=Depends(current_user)):
    return evidence_service.summarize(meeting_id, owner)


@router.post("/meetings/{meeting_id}/questions")
def ask(meeting_id: UUID, body: QuestionCreate, owner=Depends(current_user)):
    return evidence_service.ask(meeting_id, body, owner)


@router.get("/search")
def search(q: str = Query(min_length=2, max_length=160), owner=Depends(current_user)):
    return discovery_service.search(owner, q)


@router.post("/meetings/{meeting_id}/highlights", status_code=201)
def save_highlight(meeting_id: UUID, body: HighlightCreate, owner=Depends(current_user)):
    return discovery_service.save_highlight(meeting_id, body.segment_id, owner)


@router.delete("/meetings/{meeting_id}/highlights/{highlight_id}", status_code=204)
def delete_highlight(meeting_id: UUID, highlight_id: UUID, owner=Depends(current_user)):
    return discovery_service.delete_highlight(meeting_id, highlight_id, owner)


@router.post("/demo-seed")
def seed_demo(owner=Depends(current_user)):
    return demo_service.seed(owner)

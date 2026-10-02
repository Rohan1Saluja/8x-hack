from uuid import UUID

from fastapi import APIRouter, Depends

from app.routers.dependencies import current_user
from app.schemas import LifecycleAction, MeetingCreate, MeetingOut
from app.services import lifecycle_service, meeting_service

router = APIRouter()


@router.get("/me")
def me(owner=Depends(current_user)):
    return {"id": owner}


@router.get("/meetings", response_model=list[MeetingOut])
def list_meetings(owner=Depends(current_user)):
    return meeting_service.list_meetings(owner)


@router.post("/meetings", response_model=MeetingOut, status_code=201)
def create_meeting(body: MeetingCreate, owner=Depends(current_user)):
    return meeting_service.create_meeting(body, owner)


@router.get("/meetings/{meeting_id}", response_model=MeetingOut)
def get_meeting(meeting_id: UUID, owner=Depends(current_user)):
    return meeting_service.get_meeting(meeting_id, owner)


@router.get("/meetings/{meeting_id}/playback")
def get_playback(meeting_id: UUID, owner=Depends(current_user)):
    return meeting_service.get_playback(meeting_id, owner)


@router.delete("/meetings/{meeting_id}", status_code=204)
def delete_meeting(meeting_id: UUID, owner=Depends(current_user)):
    return meeting_service.delete_meeting(meeting_id, owner)


@router.post("/meetings/{meeting_id}/send", response_model=MeetingOut)
def send_notetaker(meeting_id: UUID, body: LifecycleAction, owner=Depends(current_user)):
    return lifecycle_service.transition(meeting_id, owner, "send", body)


@router.post("/meetings/{meeting_id}/admit", response_model=MeetingOut)
def admit_notetaker(meeting_id: UUID, body: LifecycleAction, owner=Depends(current_user)):
    return lifecycle_service.transition(meeting_id, owner, "admit", body)


@router.post("/meetings/{meeting_id}/advance", response_model=MeetingOut)
def advance_notetaker(meeting_id: UUID, body: LifecycleAction, owner=Depends(current_user)):
    return lifecycle_service.transition(meeting_id, owner, "advance", body)


@router.post("/meetings/{meeting_id}/stop", response_model=MeetingOut)
def stop_notetaker(meeting_id: UUID, body: LifecycleAction, owner=Depends(current_user)):
    return lifecycle_service.transition(meeting_id, owner, "stop", body)


@router.post("/meetings/{meeting_id}/retry-capture", response_model=MeetingOut)
def retry_notetaker(meeting_id: UUID, body: LifecycleAction, owner=Depends(current_user)):
    return lifecycle_service.transition(meeting_id, owner, "retry-capture", body)

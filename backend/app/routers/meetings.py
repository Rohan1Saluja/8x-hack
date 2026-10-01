from uuid import UUID

from fastapi import APIRouter, Depends

from app.routers.dependencies import current_user
from app.schemas import MeetingCreate, MeetingOut
from app.services import meeting_service

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

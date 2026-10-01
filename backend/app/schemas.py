import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MeetingCreate(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    meeting_url: str
    request_id: UUID

    @field_validator("title")
    @classmethod
    def clean_title(cls, value):
        if not value.strip():
            raise ValueError("Title cannot be blank")
        return value.strip()

    @field_validator("meeting_url")
    @classmethod
    def google_meet_only(cls, value):
        value = value.strip()
        if not re.fullmatch(r"https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}", value):
            raise ValueError("Use a Google Meet link such as https://meet.google.com/abc-defg-hij")
        return value


CaptureState = Literal["not_started", "joining", "awaiting_admission", "recording", "stopped", "failed"]
StageState = Literal["pending", "running", "ready", "failed"]


class MeetingOut(BaseModel):
    id: UUID
    title: str
    meeting_url: str
    created_at: datetime
    capture_state: CaptureState
    transcription_state: StageState
    summary_state: StageState
    failure_code: str | None
    recording_ready: bool


def meeting_out(row) -> MeetingOut:
    return MeetingOut(**row, recording_ready=bool(row["recording_key"]))

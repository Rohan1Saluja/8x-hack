import re
from datetime import datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MeetingCreate(StrictModel):
    title: str = Field(min_length=1, max_length=160)
    meeting_url: str | None = None
    demo: bool = False
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
        if value is None:
            return None
        value = value.strip()
        if not re.fullmatch(r"https://meet\.google\.com/[a-z]{3}-[a-z]{4}-[a-z]{3}", value):
            raise ValueError("Use a Google Meet link such as https://meet.google.com/abc-defg-hij")
        return value

    @model_validator(mode="after")
    def require_link_or_demo(self):
        if not self.demo and not self.meeting_url:
            raise ValueError("Provide a Google Meet link or choose a demo meeting")
        return self


class LifecycleAction(StrictModel):
    expected_version: int = Field(ge=0)
    consent: bool = False


LifecycleState = Literal[
    "not_started",
    "joining",
    "awaiting_admission",
    "recording",
    "recorded",
    "transcribing",
    "transcribed",
    "summarizing",
    "ready",
    "failed",
]


CaptureState = Literal[
    "not_started", "joining", "awaiting_admission", "recording", "stopped", "failed"
]
StageState = Literal["pending", "running", "ready", "failed"]


class MeetingOut(BaseModel):
    id: UUID
    title: str
    meeting_url: str | None
    created_at: datetime
    capture_state: CaptureState
    transcription_state: StageState
    summary_state: StageState
    failure_code: str | None
    recording_ready: bool
    duration_seconds: float | None = None
    lifecycle_state: LifecycleState
    lifecycle_version: int = 0
    lifecycle_updated_at: datetime | None = None
    capture_mode: Literal["demo", "manual"]
    consent_confirmed_at: datetime | None = None


def meeting_out(row) -> MeetingOut:
    state = row.get("demo_state")
    if not state:
        if "failed" in (row["capture_state"], row["transcription_state"], row["summary_state"]):
            state = "failed"
        elif row["summary_state"] == "ready":
            state = "ready"
        elif row["summary_state"] == "running":
            state = "summarizing"
        elif row["transcription_state"] == "ready":
            state = "transcribed"
        elif row["transcription_state"] == "running":
            state = "transcribing"
        elif row["capture_state"] == "stopped":
            state = "recorded"
        else:
            state = row["capture_state"]
    return MeetingOut(
        **row,
        recording_ready=bool(row["recording_key"]),
        lifecycle_state=state,
        capture_mode="demo" if row.get("demo_state") else "manual",
    )

from uuid import UUID

from pydantic import Field, field_validator, model_validator

from app.schemas import StrictModel


class Segment(StrictModel):
    id: UUID
    ordinal: int = Field(ge=0)
    text: str = Field(min_length=1, max_length=8000)
    start_seconds: float = Field(ge=0, lt=180, allow_inf_nan=False)
    end_seconds: float = Field(ge=0, le=180, allow_inf_nan=False)
    speaker: str | None = None

    @model_validator(mode="after")
    def ordered(self):
        if self.end_seconds < self.start_seconds:
            raise ValueError("End must follow start")
        return self


class Evidence(StrictModel):
    text: str
    source_segment_ids: list[str]


class GeneratedAction(Evidence):
    owner: str | None
    # Preserve an explicitly spoken deadline, including relative wording; never infer a date.
    due_date: str | None


class Summary(StrictModel):
    overview: Evidence
    topics: list[Evidence]
    decisions: list[Evidence]
    action_items: list[GeneratedAction]


class Answer(StrictModel):
    answer: str
    supported: bool
    source_segment_ids: list[str]


class QuestionCreate(StrictModel):
    request_id: UUID
    question: str = Field(min_length=1, max_length=2000)

    @field_validator("question")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Question cannot be blank")
        return value.strip()


class ActionUpdate(StrictModel):
    text: str = Field(min_length=1, max_length=1000)
    owner: str | None = Field(max_length=160)
    due_date: str | None = Field(max_length=160)
    completed: bool

    @field_validator("text")
    @classmethod
    def nonblank(cls, value):
        if not value.strip():
            raise ValueError("Action cannot be blank")
        return value.strip()


def validate_evidence(value: Summary | Answer, segments: list[dict]):
    valid_ids = {str(segment["id"]) for segment in segments}
    if isinstance(value, Answer):
        if value.supported and (not value.answer.strip() or not value.source_segment_ids):
            raise ValueError("Supported answers require evidence")
        if not value.supported:
            value.answer = (
                "This meeting does not contain enough information to answer that question."
            )
            value.source_segment_ids = []
        items = [value]
    else:
        items = [value.overview, *value.topics, *value.decisions, *value.action_items]
        if len(items) > 100:
            raise ValueError("Too many summary items")
        for item in items:
            if not item.text.strip() or len(item.text) > 1000 or not item.source_segment_ids:
                raise ValueError("Summary items require text and evidence")
        for action in value.action_items:
            if any(
                field is not None and len(field) > 160 for field in [action.owner, action.due_date]
            ):
                raise ValueError("Action metadata too long")
            source_text = " ".join(
                s["text"] for s in segments if str(s["id"]) in action.source_segment_ids
            ).casefold()
            for field in [action.owner, action.due_date]:
                if field is not None and (not field.strip() or field.casefold() not in source_text):
                    raise ValueError("Owner and deadline must preserve explicit source wording")
    for item in items:
        if len(item.source_segment_ids) > 30 or not set(item.source_segment_ids) <= valid_ids:
            raise ValueError("Model referenced an unknown segment")
    return value


class HighlightCreate(StrictModel):
    segment_id: UUID

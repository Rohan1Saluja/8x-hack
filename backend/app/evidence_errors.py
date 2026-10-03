"""Allowlisted validation reasons; never include model output or transcript text."""

from enum import Enum


class EvidenceReason(str, Enum):
    SCHEMA_MISMATCH = "schema_mismatch"
    OUTPUT_TRUNCATED = "output_truncated"
    INCOMPLETE_OUTPUT = "incomplete_output"
    MISSING_SOURCES = "missing_sources"
    TOO_MANY_ITEMS = "too_many_items"
    INVALID_ITEM = "invalid_item"
    ACTION_METADATA = "action_metadata"
    UNKNOWN_SEGMENT = "unknown_segment"


class EvidenceValidationError(ValueError):
    def __init__(self, reason: EvidenceReason):
        self.reason = reason
        super().__init__(reason.value)

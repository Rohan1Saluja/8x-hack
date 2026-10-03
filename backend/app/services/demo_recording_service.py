"""Optional offline speech sample. Audio is temporary and uploaded only to private Blob."""

import io
import shutil
import subprocess
import tempfile
import wave
from pathlib import Path

from app import db
from app.errors import fail
from app.integrations import storage
from app.repositories import evidence_repository, meeting_repository


def synthesize(segments, executable):
    """Pad each utterance to its stored 20-second slot; refuse any overrun."""
    pcm = []
    audio_format = None
    with tempfile.TemporaryDirectory(prefix="eightx-demo-audio-") as directory:
        for index, segment in enumerate(segments):
            if segment["start_seconds"] != index * 20 or segment["end_seconds"] != (index + 1) * 20:
                raise ValueError("Sample timeline has changed; refusing mismatched audio.")
            path = Path(directory) / f"{index}.wav"
            subprocess.run(
                [executable, "-s", "165", "-w", str(path), "--stdin"],
                input=segment["text"],
                text=True,
                check=True,
                timeout=30,
                capture_output=True,
            )
            with wave.open(str(path), "rb") as audio:
                current = (audio.getnchannels(), audio.getsampwidth(), audio.getframerate())
                if audio_format is not None and current != audio_format:
                    raise ValueError("Speech format changed between segments.")
                audio_format = current
                data = audio.readframes(audio.getnframes())
                expected = 20 * current[0] * current[1] * current[2]
                if len(data) > expected:
                    raise ValueError(
                        "Speech exceeds its evidence slot; refusing inaccurate timestamps."
                    )
                pcm.append(data + b"\0" * (expected - len(data)))
    if not audio_format or not 0 < len(segments) <= 9:
        raise ValueError("Invalid sample transcript length.")
    output = io.BytesIO()
    with wave.open(output, "wb") as audio:
        audio.setnchannels(audio_format[0])
        audio.setsampwidth(audio_format[1])
        audio.setframerate(audio_format[2])
        audio.writeframes(b"".join(pcm))
    return output.getvalue(), len(segments) * 20


def attach(meeting_id):
    executable = shutil.which("espeak-ng") or shutil.which("espeak")
    if not executable:
        fail(
            422,
            "speech_unavailable",
            "Install the free offline espeak-ng command locally, then retry.",
        )
    key = None
    try:
        with db.connection() as conn:
            meeting = meeting_repository.find_for_import(conn, meeting_id)
            if not meeting or not meeting.get("demo_seed_key"):
                fail(
                    404,
                    "sample_not_found",
                    "Choose a seeded sample meeting in the configured database.",
                )
            if meeting["recording_key"] or meeting_repository.has_running_job(conn, meeting_id):
                fail(
                    409,
                    "sample_not_empty",
                    "This sample already has media or processing in progress.",
                )
            segments = evidence_repository.list_segments(conn, meeting_id)
            content, duration = synthesize(segments, executable)
            if len(content) > storage.MAX_BYTES:
                fail(422, "recording_limit", "Sample recording exceeds the private storage limit.")
            key = storage.upload_recording(meeting_id, content)
            meeting_repository.attach_recording(conn, meeting_id, key, len(content), duration)
    except Exception:
        if key:
            storage.delete_recording(key)
        raise
    return {"duration_seconds": duration}

from fastapi import APIRouter
from fastapi.responses import FileResponse

from app.services import recording_service

router = APIRouter()


@router.get("/local-recordings/{token}", include_in_schema=False)
def local_recording(token: str):
    # FileResponse supports Range requests for seeking; the service checks the
    # expiring capability before exposing any path or bytes.
    return FileResponse(recording_service.playback_file(token))

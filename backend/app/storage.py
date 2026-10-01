from urllib.parse import quote

import httpx

from app.config import settings
from app.errors import fail


def storage_request(method: str, path: str, **kwargs):
    config = settings()
    if not config.supabase_url or not config.supabase_service_role_key.get_secret_value():
        fail(503, "storage_not_configured", "Configure private Supabase Storage.")
    base = config.supabase_url.rstrip("/") + "/storage/v1"
    key = config.supabase_service_role_key.get_secret_value()
    headers = {"Authorization": f"Bearer {key}", "apikey": key}
    with httpx.Client(timeout=20, follow_redirects=False) as client:
        response = client.request(method, base + path, headers=headers, **kwargs)
    if response.status_code >= 400:
        fail(502, "storage_unavailable", "Recording storage is unavailable. Try again.", True)
    return response


def playback_url(key: str):
    config = settings()
    path = f"/object/sign/{quote(config.recording_bucket, safe='')}/{quote(key, safe='/')}"
    body = storage_request("POST", path, json={"expiresIn": config.playback_url_seconds}).json()
    signed = body.get("signedURL") or body.get("signedUrl")
    if not isinstance(signed, str) or not signed.startswith("/object/sign/"):
        fail(502, "invalid_storage_response", "Unable to authorize playback.", True)
    return {
        "url": config.supabase_url.rstrip("/") + "/storage/v1" + signed,
        "expires_in": config.playback_url_seconds,
    }


def delete_recording(key: str):
    storage_request(
        "DELETE", f"/object/{quote(settings().recording_bucket, safe='')}", json={"prefixes": [key]}
    )

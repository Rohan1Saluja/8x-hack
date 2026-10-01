from fastapi import APIRouter

from app.config import settings

router = APIRouter()


@router.get("/health")
def health():
    config = settings()
    return {
        "status": "ok",
        "configuration": {
            "auth": bool(config.auth0_domain and config.auth0_audience),
            "database": bool(config.database_url.get_secret_value()),
            "storage": bool(config.blob_read_write_token.get_secret_value()),
        },
    }

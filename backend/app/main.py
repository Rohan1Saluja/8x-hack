import httpx
import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.evidence import router as evidence_router
from app.meetings import router

app = FastAPI(title="8x meeting assistant", version="0.1.0")
app.include_router(router)
app.include_router(evidence_router)


@app.middleware("http")
async def privacy_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["Cache-Control"] = "no-store"
    response.headers["X-Content-Type-Options"] = "nosniff"
    return response


@app.exception_handler(RequestValidationError)
async def validation_error(request, exc):
    # Default validation output can echo user inputs, including tokens or transcript content.
    return JSONResponse(
        status_code=422,
        content={
            "detail": {
                "code": "invalid_input",
                "message": "Check the request fields and Google Meet link.",
                "retryable": False,
            }
        },
    )


@app.exception_handler(psycopg.Error)
async def database_error(request, exc):
    return JSONResponse(
        status_code=503,
        content={
            "detail": {
                "code": "database_unavailable",
                "message": "Database unavailable. Check setup and migrations.",
                "retryable": True,
            }
        },
    )


@app.exception_handler(httpx.HTTPError)
async def provider_error(request, exc):
    return JSONResponse(
        status_code=502,
        content={
            "detail": {
                "code": "provider_unavailable",
                "message": "Provider unavailable. Try again shortly.",
                "retryable": True,
            }
        },
    )


@app.get("/health")
def health():
    config = settings()
    return {
        "status": "ok",
        "configuration": {
            "auth": bool(config.auth0_domain and config.auth0_audience),
            "database": bool(config.database_url.get_secret_value()),
            "storage": bool(
                config.supabase_url and config.supabase_service_role_key.get_secret_value()
            ),
        },
    }

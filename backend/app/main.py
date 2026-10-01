from contextlib import asynccontextmanager

import httpx
import psycopg
from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

from app.config import settings
from app.errors import AppError
from app.integrations import local_storage
from app.routers.evidence import router as evidence_router
from app.routers.health import router as health_router
from app.routers.meetings import router
from app.routers.recordings import router as recordings_router


@asynccontextmanager
async def lifespan(app):
    if settings().recording_storage == "local":
        local_storage.root()
    yield


app = FastAPI(title="8x meeting assistant", version="0.1.0", lifespan=lifespan)
app.include_router(router)
app.include_router(evidence_router)
app.include_router(health_router)
app.include_router(recordings_router)


@app.exception_handler(AppError)
async def application_error(request, exc):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


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

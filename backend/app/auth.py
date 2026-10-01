from functools import lru_cache

import jwt
from fastapi import Depends
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import settings
from app.errors import fail

bearer = HTTPBearer(auto_error=False)


@lru_cache
def jwks_client(issuer: str) -> PyJWKClient:
    return PyJWKClient(f"{issuer}.well-known/jwks.json", cache_jwk_set=True, lifespan=300, timeout=5)


def subject(credentials: HTTPAuthorizationCredentials | None = Depends(bearer)) -> str:
    if credentials is None or credentials.scheme.lower() != "bearer":
        fail(401, "unauthorized", "Sign in to continue.")
    config = settings()
    if not config.auth0_domain or not config.auth0_audience:
        fail(503, "auth_not_configured", "Configure backend Auth0 domain and API audience.")
    try:
        issuer = config.issuer
        token = credentials.credentials
        if jwt.get_unverified_header(token).get("alg") != "RS256":
            fail(401, "invalid_token", "Access token is invalid or expired.")
        key = jwks_client(issuer).get_signing_key_from_jwt(token).key
        claims = jwt.decode(
            token, key, algorithms=["RS256"], audience=config.auth0_audience, issuer=issuer,
            options={"require": ["exp", "iat", "iss", "aud", "sub"]}, leeway=5,
        )
        value = claims["sub"]
        if not isinstance(value, str) or not value or len(value) > 255:
            raise ValueError("Invalid subject")
        return value
    except jwt.PyJWKClientConnectionError:
        fail(503, "auth_unavailable", "Unable to verify identity. Try again shortly.", True)
    except (jwt.PyJWTError, ValueError):
        fail(401, "invalid_token", "Access token is invalid or expired.")

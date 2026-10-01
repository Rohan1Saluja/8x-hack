from fastapi import Depends

from app.auth import subject
from app.services import user_service


def current_user(auth0_sub: str = Depends(subject)):
    return user_service.resolve(auth0_sub)

from app import db
from app.repositories import user_repository


def resolve(auth0_sub: str):
    with db.connection() as conn:
        return user_repository.resolve(conn, auth0_sub)

from fastapi import HTTPException


def fail(status: int, code: str, message: str, retryable: bool = False):
    raise HTTPException(status, detail={"code": code, "message": message, "retryable": retryable})

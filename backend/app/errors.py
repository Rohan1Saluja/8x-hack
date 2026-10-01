class AppError(Exception):
    """Application failure translated to an HTTP response at the API boundary."""

    def __init__(self, status: int, code: str, message: str, retryable: bool = False):
        super().__init__(message)
        self.status_code = status
        self.detail = {"code": code, "message": message, "retryable": retryable}


def fail(status: int, code: str, message: str, retryable: bool = False):
    raise AppError(status, code, message, retryable)

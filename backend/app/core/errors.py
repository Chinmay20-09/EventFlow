"""Error handling and the standard response envelope (EV-016 §3, EV-024).

Every response uses one of the two documented shapes:

    Success: {"success": true,  "data": {...}}
    Failure: {"success": false, "error": {"code": "...", "message": "..."}}
"""

import logging

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from sqlalchemy.exc import SQLAlchemyError

logger = logging.getLogger("eventflow.p3")

# Documented error codes (EV-024 §4) with their HTTP status codes.
ERROR_STATUS = {
    "VALIDATION_ERROR": 422,
    "NOT_FOUND": 404,
    "INVALID_STATE": 409,
    "UNAUTHORIZED": 401,
    "FORBIDDEN": 403,
    "DATABASE_ERROR": 500,
    "INTERNAL_ERROR": 500,
}


class AppError(Exception):
    """Application error carrying a documented error code (EV-024 §4)."""

    def __init__(self, code: str, message: str, status_code: int | None = None):
        super().__init__(message)
        self.code = code
        self.message = message
        self.status_code = status_code or ERROR_STATUS.get(code, 500)


def ok(data) -> dict:
    """Build the documented success envelope (EV-016 §3)."""
    return {"success": True, "data": data}


def error_response(code: str, message: str, status_code: int) -> JSONResponse:
    """Build the documented error envelope (EV-016 §3, EV-024 §3)."""
    return JSONResponse(
        status_code=status_code,
        content={"success": False, "error": {"code": code, "message": message}},
    )


def setup_error_handlers(app: FastAPI) -> None:
    """Register the global exception handlers that produce the error envelope."""

    @app.exception_handler(AppError)
    async def _app_error(request: Request, exc: AppError) -> JSONResponse:
        # Known, intentional application error — no stack trace logging needed.
        return error_response(exc.code, exc.message, exc.status_code)

    @app.exception_handler(RequestValidationError)
    async def _validation_error(request: Request, exc: RequestValidationError) -> JSONResponse:
        # Report the first offending field back to the caller; store nothing (EV-024 §5).
        message = "Invalid request"
        if exc.errors():
            first = exc.errors()[0]
            location = ".".join(str(part) for part in first.get("loc", []) if part != "body")
            detail = first.get("msg", "invalid value")
            message = f"Invalid request: {location}: {detail}" if location else f"Invalid request: {detail}"
        return error_response("VALIDATION_ERROR", message, 422)

    @app.exception_handler(SQLAlchemyError)
    async def _database_error(request: Request, exc: SQLAlchemyError) -> JSONResponse:
        # Log the technical failure for developers; never expose internals (EV-024 §9/§15).
        logger.exception("Database failure on %s %s", request.method, request.url.path)
        return error_response("DATABASE_ERROR", "Database operation failed", 500)

    @app.exception_handler(Exception)
    async def _internal_error(request: Request, exc: Exception) -> JSONResponse:
        logger.exception("Unexpected failure on %s %s", request.method, request.url.path)
        return error_response("INTERNAL_ERROR", "Unexpected server error", 500)

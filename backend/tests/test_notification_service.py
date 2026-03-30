from __future__ import annotations

from pathlib import Path
import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from sqlalchemy.pool import StaticPool


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app import models as _models  # noqa: F401
from app.api.routes import auth as auth_module
from app.database import Base
from app.models.user import PasswordReset, User
import app.services.notification_service as notification_service_module
from app.services.notification_service import NotificationService


def _build_settings(**overrides):
    defaults = {
        "auto_notify_enabled": True,
        "email_provider": "auto",
        "email_timeout_seconds": 12.5,
        "resend_api_key": "re_test_123",
        "resend_api_base_url": "https://api.resend.com",
        "smtp_host": "smtp.gmail.com",
        "smtp_port": 587,
        "smtp_user": "",
        "smtp_password": "",
        "smtp_from": "PyZone <noreply@pyzone.uz>",
        "eskiz_email": "",
        "eskiz_password": "",
    }
    defaults.update(overrides)
    return SimpleNamespace(**defaults)


class _DummyResponse:
    def __init__(self, status_code: int, text: str = "ok") -> None:
        self.status_code = status_code
        self.text = text


def _make_engine():
    return create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )


def test_send_email_uses_resend_when_available(monkeypatch) -> None:
    service = NotificationService()
    captured: dict[str, object] = {}

    class DummyClient:
        def __init__(self, timeout: float) -> None:
            captured["timeout"] = timeout

        def __enter__(self):
            return self

        def __exit__(self, exc_type, exc, tb) -> bool:
            return False

        def post(self, url: str, headers=None, json=None):
            captured["url"] = url
            captured["headers"] = headers
            captured["json"] = json
            return _DummyResponse(202, "accepted")

    monkeypatch.setattr(notification_service_module, "settings", _build_settings())
    monkeypatch.setattr(notification_service_module.httpx, "Client", DummyClient)

    sent = service.send_email(
        "solver@example.com",
        "PyZone reset code",
        "<b>1234</b>",
        is_html=True,
    )

    assert sent is True
    assert captured["timeout"] == 12.5
    assert captured["url"] == "https://api.resend.com/emails"
    assert captured["headers"]["Authorization"] == "Bearer re_test_123"
    assert captured["json"] == {
        "from": "PyZone <noreply@pyzone.uz>",
        "to": ["solver@example.com"],
        "subject": "PyZone reset code",
        "html": "<b>1234</b>",
    }


def test_send_email_falls_back_to_smtp_when_resend_missing(monkeypatch) -> None:
    service = NotificationService()
    monkeypatch.setattr(
        notification_service_module,
        "settings",
        _build_settings(
            resend_api_key="",
            smtp_user="arena@example.com",
            smtp_password="secret",
        ),
    )

    called = {"smtp": False}

    def fake_send_email_via_smtp(*args, **kwargs) -> bool:
        called["smtp"] = True
        return True

    monkeypatch.setattr(service, "_send_email_via_smtp", fake_send_email_via_smtp)

    sent = service.send_email("solver@example.com", "Subject", "Body", is_html=False)

    assert sent is True
    assert called["smtp"] is True


def test_request_password_reset_cleans_up_code_when_email_send_fails(monkeypatch) -> None:
    engine = _make_engine()
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)

    with Session() as db:
        user = User(
            username="reset_me",
            email="reset@example.com",
            password_hash="hashed",
        )
        db.add(user)
        db.commit()
        user_id = user.id

    monkeypatch.setattr(auth_module.notification_service, "send_email", lambda *args, **kwargs: False)
    monkeypatch.setattr(auth_module.notification_service, "get_email_provider", lambda: "smtp")

    with Session() as db:
        with pytest.raises(HTTPException) as exc_info:
            auth_module.request_password_reset(auth_module.ResetRequest(email="reset@example.com"), db)

    assert exc_info.value.status_code == 500

    with Session() as db:
        remaining_codes = db.query(PasswordReset).filter(PasswordReset.user_id == user_id).count()

    assert remaining_codes == 0

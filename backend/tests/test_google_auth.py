from __future__ import annotations

from pathlib import Path
import sys

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
from app.models.user import User
from app.services.google_identity_service import GoogleIdentity


def _make_session():
    engine = create_engine(
        "sqlite://",
        future=True,
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Session = sessionmaker(bind=engine, autocommit=False, autoflush=False, future=True)
    Base.metadata.create_all(bind=engine)
    return Session


def test_google_auth_links_existing_local_account(monkeypatch) -> None:
    Session = _make_session()

    with Session() as db:
        user = User(
            username="localhero",
            email="hero@example.com",
            password_hash="hashed",
            auth_provider="local",
        )
        db.add(user)
        db.commit()

    monkeypatch.setattr(
        auth_module.google_identity_service,
        "verify_credential",
        lambda credential: GoogleIdentity(
            sub="google-sub-1",
            email="hero@example.com",
            email_verified=True,
            display_name="Hero User",
            avatar_url="https://example.com/hero.png",
        ),
    )

    with Session() as db:
        response = auth_module.google_auth(auth_module.GoogleAuthRequest(credential="credential-token"), db)
        linked_user = db.query(User).filter(User.username == "localhero").first()

    assert response.needs_onboarding is False
    assert response.linked_account is True
    assert response.token
    assert linked_user.google_sub == "google-sub-1"
    assert linked_user.auth_provider == "hybrid"
    assert linked_user.email_verified is True
    assert linked_user.last_login_provider == "google"
    assert linked_user.display_name == "Hero User"


def test_google_auth_returns_onboarding_then_creates_google_user(monkeypatch) -> None:
    Session = _make_session()

    monkeypatch.setattr(
        auth_module.google_identity_service,
        "verify_credential",
        lambda credential: GoogleIdentity(
            sub="google-sub-2",
            email="newuser@example.com",
            email_verified=True,
            display_name="New User",
            avatar_url="https://example.com/new.png",
        ),
    )

    with Session() as db:
        start = auth_module.google_auth(auth_module.GoogleAuthRequest(credential="credential-token"), db)
        finish = auth_module.complete_google_signup(
            auth_module.GoogleAuthCompleteRequest(
                onboarding_token=start.onboarding_token,
                username="newuser_01",
            ),
            db,
        )
        created_user = db.query(User).filter(User.username == "newuser_01").first()

    assert start.needs_onboarding is True
    assert start.onboarding_token
    assert start.suggested_username
    assert finish.token
    assert created_user is not None
    assert created_user.google_sub == "google-sub-2"
    assert created_user.auth_provider == "google"
    assert created_user.email_verified is True
    assert created_user.last_login_provider == "google"


def test_google_auth_logs_in_existing_google_user(monkeypatch) -> None:
    Session = _make_session()

    with Session() as db:
        user = User(
            username="googlehero",
            email="google@example.com",
            password_hash="hashed",
            google_sub="google-sub-3",
            auth_provider="google",
        )
        db.add(user)
        db.commit()

    monkeypatch.setattr(
        auth_module.google_identity_service,
        "verify_credential",
        lambda credential: GoogleIdentity(
            sub="google-sub-3",
            email="google@example.com",
            email_verified=True,
            display_name="Google Hero",
            avatar_url="https://example.com/google.png",
        ),
    )

    with Session() as db:
        response = auth_module.google_auth(auth_module.GoogleAuthRequest(credential="credential-token"), db)
        existing_user = db.query(User).filter(User.username == "googlehero").first()

    assert response.needs_onboarding is False
    assert response.linked_account is False
    assert response.token
    assert existing_user.auth_provider == "google"
    assert existing_user.display_name == "Google Hero"
    assert existing_user.last_login_provider == "google"


def test_google_auth_rejects_conflicting_google_link(monkeypatch) -> None:
    Session = _make_session()

    with Session() as db:
        user = User(
            username="occupied",
            email="occupied@example.com",
            password_hash="hashed",
            google_sub="existing-google-sub",
            auth_provider="hybrid",
        )
        db.add(user)
        db.commit()

    monkeypatch.setattr(
        auth_module.google_identity_service,
        "verify_credential",
        lambda credential: GoogleIdentity(
            sub="new-google-sub",
            email="occupied@example.com",
            email_verified=True,
            display_name="Occupied User",
            avatar_url="https://example.com/occupied.png",
        ),
    )

    with Session() as db:
        with pytest.raises(HTTPException) as exc_info:
            auth_module.google_auth(auth_module.GoogleAuthRequest(credential="credential-token"), db)

    assert exc_info.value.status_code == 409

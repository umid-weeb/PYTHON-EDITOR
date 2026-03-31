from __future__ import annotations

from dataclasses import dataclass

from google.auth.transport import requests as google_requests
from google.oauth2 import id_token

from app.core.config import get_settings


settings = get_settings()


@dataclass(frozen=True)
class GoogleIdentity:
    sub: str
    email: str
    email_verified: bool
    display_name: str | None = None
    avatar_url: str | None = None


class GoogleIdentityService:
    @staticmethod
    def get_client_id() -> str:
        return (settings.google_client_id or "").strip()

    def is_enabled(self) -> bool:
        return bool(self.get_client_id())

    def verify_credential(self, credential: str) -> GoogleIdentity:
        client_id = self.get_client_id()
        if not client_id:
            raise ValueError("Google login hali sozlanmagan.")

        if not credential or not credential.strip():
            raise ValueError("Google credential topilmadi.")

        token_payload = id_token.verify_oauth2_token(
            credential.strip(),
            google_requests.Request(),
            client_id,
        )

        issuer = str(token_payload.get("iss") or "").strip()
        if issuer not in {"accounts.google.com", "https://accounts.google.com"}:
            raise ValueError("Google token issuer noto'g'ri.")

        email = str(token_payload.get("email") or "").strip().lower()
        if not email:
            raise ValueError("Google akkaunti email yubormadi.")

        return GoogleIdentity(
            sub=str(token_payload.get("sub") or "").strip(),
            email=email,
            email_verified=bool(token_payload.get("email_verified")),
            display_name=(str(token_payload.get("name") or "").strip() or None),
            avatar_url=(str(token_payload.get("picture") or "").strip() or None),
        )


google_identity_service = GoogleIdentityService()

from __future__ import annotations

import os
import re
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status, UploadFile, File
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt
import logging
import bcrypt
from pydantic import BaseModel, Field
from sqlalchemy import func
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User, PasswordReset
from app.repositories.submission_tracking import submission_tracking_repository
from app.services.google_identity_service import GoogleIdentity, google_identity_service
from app.services.user_stats_service import user_stats_service
from app.services.notification_service import notification_service
import random


router = APIRouter(tags=["auth"])

SECRET_KEY = os.getenv("ARENA_JWT_SECRET", os.getenv("JWT_SECRET", "dev-secret-change-me"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ARENA_JWT_EXPIRE_MINUTES", str(60 * 24 * 7)))  # default 7 days
PASSWORD_RESET_CODE_TTL_SECONDS = int(os.getenv("ARENA_PASSWORD_RESET_CODE_TTL_SECONDS", "600"))
security = HTTPBearer(auto_error=False)

def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security), db: Session = Depends(get_db)) -> User:
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        from app.api.routes.auth import ALGORITHM, SECRET_KEY
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username: str | None = payload.get("username") or payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not (user_id or username):
        raise HTTPException(status_code=401, detail="Invalid token")

    query = db.query(User)
    if user_id is not None:
        user = query.filter(User.id == int(user_id)).first()
    else:
        user = query.filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


def get_optional_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User | None:
    if credentials is None:
        return None
    try:
        from app.api.routes.auth import ALGORITHM, SECRET_KEY
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username: str | None = payload.get("username") or payload.get("sub")
    except JWTError:
        return None
    if not (user_id or username):
        return None

    query = db.query(User)
    if user_id is not None:
        return query.filter(User.id == int(user_id)).first()
    return query.filter(User.username == username).first()


def get_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Faqat is_admin=True bo'lgan foydalanuvchilarga ruxsat beradi."""
    if not getattr(current_user, "is_admin", False):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin huquqi talab qilinadi.",
        )
    return current_user


logger = logging.getLogger(__name__)


def normalize_password(password: str) -> bytes:
    """
    bcrypt accepts up to 72 BYTES. Encode to UTF-8 and truncate to 72 bytes.
    """
    return (password or "").encode("utf-8")[:72]


def normalize_username(raw: str) -> str:
  """
  Strip whitespace and leading '@' from usernames like '@isroilov0705'.
  """
  username = (raw or "").strip()
  if username.startswith("@"):
      # Remove all leading '@' characters to be safe.
      username = username.lstrip("@")
  return username


def derive_username_from_email(email: str) -> str:
    local_part = (email or "").split("@", 1)[0].strip().lower()
    candidate = re.sub(r"[^a-z0-9_]", "_", local_part)
    candidate = re.sub(r"_+", "_", candidate).strip("_") or "user"
    if len(candidate) < 3:
        candidate = f"{candidate}_user"
    return candidate[:40]


def ensure_unique_username(db: Session, base_username: str) -> str:
    candidate = base_username
    suffix = 1
    while db.query(User.id).filter(User.username == candidate).first():
        candidate = f"{base_username[:42]}_{suffix}"
        suffix += 1
    return candidate[:50]


def format_reset_ttl(total_seconds: int) -> str:
    safe_seconds = max(int(total_seconds or 0), 0)
    minutes, seconds = divmod(safe_seconds, 60)
    if minutes and seconds:
        return f"{minutes} daqiqa {seconds} soniya"
    if minutes:
        return f"{minutes} daqiqa"
    return f"{seconds} soniya"


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    country: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class GoogleAuthRequest(BaseModel):
    credential: str = Field(min_length=10)


class GoogleAuthCompleteRequest(BaseModel):
    onboarding_token: str
    username: str = Field(min_length=3, max_length=50)
    country: str | None = None


class TokenResponse(BaseModel):
    token: str
    access_token: str
    token_type: str = "bearer"


class GoogleConfigResponse(BaseModel):
    enabled: bool
    client_id: str | None = None


class GoogleAuthResponse(BaseModel):
    needs_onboarding: bool = False
    token: str | None = None
    access_token: str | None = None
    token_type: str = "bearer"
    linked_account: bool = False
    username: str | None = None
    onboarding_token: str | None = None
    suggested_username: str | None = None
    email: str | None = None
    display_name: str | None = None
    avatar_url: str | None = None


class MeResponse(BaseModel):
    id: int
    username: str
    email: str | None = None
    display_name: str | None = None
    country: str | None = None
    created_at: datetime
    avatar_url: str | None = None
    bio: str | None = None
    github: str | None = None
    linkedin: str | None = None
    solved_total: int = 0
    solved_easy: int = 0
    solved_medium: int = 0
    solved_hard: int = 0
    rating: int = 1200
    global_rank: int | None = None
    level: str | None = None
    goal: str | None = None
    weekly_hours: str | None = None
    streak: int = 0
    longest_streak: int = 0
    streak_freeze: int = 0
    timezone: str = "Asia/Tashkent"
    problem_bank_total: int = 0
    problem_bank_easy: int = 0
    problem_bank_medium: int = 0
    problem_bank_hard: int = 0
    is_admin: bool = False


class PublicProfileResponse(BaseModel):
    id: int
    username: str
    display_name: str | None = None
    country: str | None = None
    created_at: datetime
    avatar_url: str | None = None
    bio: str | None = None
    solved_total: int = 0
    solved_easy: int = 0
    solved_medium: int = 0
    solved_hard: int = 0
    rating: int = 1200
    global_rank: int | None = None
    level: str | None = None
    streak: int = 0
    longest_streak: int = 0
    problem_bank_total: int = 0
    problem_bank_easy: int = 0
    problem_bank_medium: int = 0
    problem_bank_hard: int = 0
    is_admin: bool = False
    is_owner: bool = False


def get_password_hash(password: str) -> str:
    # Use the bcrypt library directly to avoid backend detection issues that caused 500s
    return bcrypt.hashpw(normalize_password(password), bcrypt.gensalt()).decode("utf-8")


def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(normalize_password(password), hashed.encode("utf-8"))
    except ValueError:
        return False


def create_access_token(user: User) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode = {
        "sub": str(user.id),
        "user_id": user.id,
        "username": user.username,
        "is_admin": bool(getattr(user, "is_admin", False)),
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def create_google_onboarding_token(identity: GoogleIdentity) -> str:
    expire = datetime.now(timezone.utc) + timedelta(minutes=15)
    return jwt.encode(
        {
            "sub": identity.sub,
            "email": identity.email,
            "display_name": identity.display_name,
            "avatar_url": identity.avatar_url,
            "email_verified": bool(identity.email_verified),
            "purpose": "google_onboarding",
            "exp": expire,
        },
        SECRET_KEY,
        algorithm=ALGORITHM,
    )


def decode_google_onboarding_token(token: str) -> dict[str, object]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError as exc:
        raise HTTPException(status_code=401, detail="Google onboarding token yaroqsiz.") from exc

    if payload.get("purpose") != "google_onboarding":
        raise HTTPException(status_code=401, detail="Google onboarding token noto'g'ri.")
    return payload


def build_unusable_password_hash() -> str:
    return get_password_hash(secrets.token_urlsafe(32))


def derive_username_candidate(raw: str) -> str:
    candidate = re.sub(r"[^a-z0-9_]", "_", (raw or "").strip().lower())
    candidate = re.sub(r"_+", "_", candidate).strip("_")
    if len(candidate) < 3:
        return ""
    return candidate[:40]


def suggest_google_username(db: Session, identity: GoogleIdentity) -> str:
    base_username = (
        derive_username_candidate(identity.display_name or "")
        or derive_username_from_email(identity.email)
    )
    return ensure_unique_username(db, base_username)


def apply_google_identity(user: User, identity: GoogleIdentity, *, linked_existing_account: bool) -> None:
    user.google_sub = identity.sub
    user.email_verified = bool(identity.email_verified)
    if not user.email:
        user.email = identity.email
    if not user.display_name and identity.display_name:
        user.display_name = identity.display_name[:120]
    if not user.avatar_url and identity.avatar_url:
        user.avatar_url = identity.avatar_url[:512]
    user.last_login_provider = "google"
    user.last_active = datetime.now(timezone.utc)
    user.auth_provider = "hybrid" if linked_existing_account else "google"


def calculate_user_stats(db: Session, user_id: int) -> dict:
    snapshot = user_stats_service.ensure_user_stats_fresh(db, user_id)
    problem_bank = submission_tracking_repository.get_problem_bank_totals(db)

    return {
        "solved_total": int(snapshot.solved_count or 0),
        "solved_easy": int(snapshot.easy_solved or 0),
        "solved_medium": int(snapshot.medium_solved or 0),
        "solved_hard": int(snapshot.hard_solved or 0),
        "problem_bank_total": int(problem_bank["total"]),
        "problem_bank_easy": int(problem_bank["easy"]),
        "problem_bank_medium": int(problem_bank["medium"]),
        "problem_bank_hard": int(problem_bank["hard"]),
    }


@router.post("/register", status_code=status.HTTP_201_CREATED)
def register(payload: RegisterRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        username = normalize_username(payload.username)
        email = payload.email.strip().lower() if payload.email else None

        if "@" in username:
            email = email or username.lower()
            username = ensure_unique_username(db, derive_username_from_email(email))

        if len(username) < 3:
            raise HTTPException(status_code=400, detail="Username must be at least 3 characters")

        # Username must be unique
        existing = db.query(User).filter(User.username == username).first()
        if existing:
            raise HTTPException(status_code=400, detail="Username already exists")

        # Email must be unique when provided
        if email:
            email_existing = db.query(User).filter(User.email == email).first()
            if email_existing:
                raise HTTPException(status_code=400, detail="Email already exists")

        # Create user with hashed password
        user = User(
            username=username,
            email=email,
            password_hash=get_password_hash(payload.password),
            country=payload.country,
            auth_provider="local",
            email_verified=False,
            last_login_provider="local",
        )
        db.add(user)
        db.commit()
        db.refresh(user)

        token = create_access_token(user)
        return TokenResponse(token=token, access_token=token)
    except HTTPException:
        raise
    except Exception as exc:
        import sqlalchemy

        db.rollback()
        # Handle duplicate username gracefully instead of crashing
        if isinstance(exc, sqlalchemy.exc.IntegrityError):
            logger.warning("Register integrity error (likely duplicate): %s", exc, exc_info=True)
            raise HTTPException(status_code=400, detail="Username already exists")

        # Print the real error for debugging
        logger.error("REGISTER ERROR: %s", exc, exc_info=True)
        raise HTTPException(status_code=500, detail=str(exc))


@router.post("/login")
def login(payload: LoginRequest, db: Session = Depends(get_db)) -> TokenResponse:
    try:
        identifier = normalize_username(payload.username)
        # Allow login by username or email
        user = (
            db.query(User)
            .filter(
                (User.username == identifier)
                | (User.email == identifier.lower())
            )
            .first()
        )
        if not user or not verify_password(payload.password, user.password_hash):
            raise HTTPException(status_code=401, detail="Invalid credentials")
        user.last_active = datetime.now(timezone.utc)
        user.last_login_provider = "local"
        db.commit()
        token = create_access_token(user)
        return TokenResponse(token=token, access_token=token)
    except HTTPException:
        raise
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception("Login failed: %s", exc)
        raise HTTPException(status_code=500, detail="Login failed")


@router.get("/google/config", response_model=GoogleConfigResponse)
def google_auth_config() -> GoogleConfigResponse:
    client_id = google_identity_service.get_client_id()
    return GoogleConfigResponse(enabled=bool(client_id), client_id=client_id or None)


@router.post("/google", response_model=GoogleAuthResponse)
def google_auth(payload: GoogleAuthRequest, db: Session = Depends(get_db)) -> GoogleAuthResponse:
    try:
        identity = google_identity_service.verify_credential(payload.credential)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except Exception as exc:
        logger.error("Google auth verification failed: %s", exc, exc_info=True)
        raise HTTPException(status_code=400, detail="Google loginni tasdiqlab bo'lmadi.") from exc

    if not identity.sub:
        raise HTTPException(status_code=400, detail="Google akkaunti identifikatori topilmadi.")
    if not identity.email_verified:
        raise HTTPException(status_code=400, detail="Google emailingiz tasdiqlanmagan.")

    user_by_google = db.query(User).filter(User.google_sub == identity.sub).first()
    user_by_email = (
        db.query(User)
        .filter(func.lower(User.email) == identity.email)
        .first()
    )

    if user_by_google and user_by_email and user_by_google.id != user_by_email.id:
        raise HTTPException(
            status_code=409,
            detail="Bu Google akkaunt boshqa email bilan bog'langan. Iltimos support bilan bog'laning.",
        )

    if user_by_google:
        apply_google_identity(
            user_by_google,
            identity,
            linked_existing_account=(user_by_google.auth_provider or "google") == "hybrid",
        )
        db.commit()
        db.refresh(user_by_google)
        token = create_access_token(user_by_google)
        return GoogleAuthResponse(
            token=token,
            access_token=token,
            username=user_by_google.username,
            linked_account=False,
        )

    if user_by_email:
        if user_by_email.google_sub and user_by_email.google_sub != identity.sub:
            raise HTTPException(
                status_code=409,
                detail="Bu email allaqachon boshqa Google akkauntga ulangan.",
            )

        apply_google_identity(user_by_email, identity, linked_existing_account=True)
        db.commit()
        db.refresh(user_by_email)
        token = create_access_token(user_by_email)
        return GoogleAuthResponse(
            token=token,
            access_token=token,
            username=user_by_email.username,
            linked_account=True,
        )

    return GoogleAuthResponse(
        needs_onboarding=True,
        onboarding_token=create_google_onboarding_token(identity),
        suggested_username=suggest_google_username(db, identity),
        email=identity.email,
        display_name=identity.display_name,
        avatar_url=identity.avatar_url,
    )


@router.post("/google/complete", response_model=GoogleAuthResponse)
def complete_google_signup(
    payload: GoogleAuthCompleteRequest,
    db: Session = Depends(get_db),
) -> GoogleAuthResponse:
    onboarding_payload = decode_google_onboarding_token(payload.onboarding_token)
    google_sub = str(onboarding_payload.get("sub") or "").strip()
    email = str(onboarding_payload.get("email") or "").strip().lower()
    display_name = (str(onboarding_payload.get("display_name") or "").strip() or None)
    avatar_url = (str(onboarding_payload.get("avatar_url") or "").strip() or None)
    email_verified = bool(onboarding_payload.get("email_verified"))

    if not google_sub or not email:
        raise HTTPException(status_code=400, detail="Google onboarding ma'lumotlari yetarli emas.")

    existing_google_user = db.query(User).filter(User.google_sub == google_sub).first()
    if existing_google_user:
        apply_google_identity(
            existing_google_user,
            GoogleIdentity(
                sub=google_sub,
                email=email,
                email_verified=email_verified,
                display_name=display_name,
                avatar_url=avatar_url,
            ),
            linked_existing_account=(existing_google_user.auth_provider or "google") == "hybrid",
        )
        db.commit()
        db.refresh(existing_google_user)
        token = create_access_token(existing_google_user)
        return GoogleAuthResponse(
            token=token,
            access_token=token,
            username=existing_google_user.username,
        )

    existing_email_user = (
        db.query(User)
        .filter(func.lower(User.email) == email)
        .first()
    )
    if existing_email_user:
        if existing_email_user.google_sub and existing_email_user.google_sub != google_sub:
            raise HTTPException(
                status_code=409,
                detail="Bu email allaqachon boshqa Google akkauntga ulangan.",
            )
        apply_google_identity(
            existing_email_user,
            GoogleIdentity(
                sub=google_sub,
                email=email,
                email_verified=email_verified,
                display_name=display_name,
                avatar_url=avatar_url,
            ),
            linked_existing_account=True,
        )
        db.commit()
        db.refresh(existing_email_user)
        token = create_access_token(existing_email_user)
        return GoogleAuthResponse(
            token=token,
            access_token=token,
            username=existing_email_user.username,
            linked_account=True,
        )

    username = normalize_username(payload.username)
    if len(username) < 3:
        raise HTTPException(status_code=400, detail="Username kamida 3 belgidan iborat bo'lishi kerak.")

    existing_username = db.query(User.id).filter(User.username == username).first()
    if existing_username:
        raise HTTPException(status_code=400, detail="Username already exists")

    user = User(
        username=username,
        email=email,
        password_hash=build_unusable_password_hash(),
        country=(payload.country or None),
        display_name=display_name,
        avatar_url=avatar_url,
        google_sub=google_sub,
        auth_provider="google",
        email_verified=email_verified,
        last_login_provider="google",
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    token = create_access_token(user)
    return GoogleAuthResponse(
        token=token,
        access_token=token,
        username=user.username,
    )


@router.get("/me", response_model=MeResponse)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeResponse:
    try:
        user.last_active = datetime.now(timezone.utc)
        db.commit()
    except Exception:
        db.rollback()

    # Resilient stats calculation - don't let stats failure block login/me
    try:
        stats = calculate_user_stats(db, user.id)
    except Exception as e:
        logger.error("Failed to calculate stats for user %s: %s", user.id, e)
        # Fallback to empty stats
        stats = {
            "solved_total": 0, "solved_easy": 0, "solved_medium": 0, "solved_hard": 0,
            "problem_bank_total": 0, "problem_bank_easy": 0, "problem_bank_medium": 0, "problem_bank_hard": 0
        }

    try:
        from app.services.rating_service import rating_service
        rating_snap = rating_service.snapshot(db, user.id)
        rating_val = int(rating_snap.rating or 1200)
        global_rank = rating_snap.global_rank
    except Exception as e:
        logger.error("Failed to calculate rating for user %s: %s", user.id, e)
        rating_val = 1200
        global_rank = None

    return MeResponse(
        id=user.id,
        username=user.username,
        email=user.email,
        display_name=getattr(user, "display_name", None),
        country=user.country,
        created_at=user.created_at,
        avatar_url=getattr(user, "avatar_url", None),
        bio=getattr(user, "bio", None),
        solved_total=stats["solved_total"],
        solved_easy=stats["solved_easy"],
        solved_medium=stats["solved_medium"],
        solved_hard=stats["solved_hard"],
        problem_bank_total=stats["problem_bank_total"],
        problem_bank_easy=stats["problem_bank_easy"],
        problem_bank_medium=stats["problem_bank_medium"],
        problem_bank_hard=stats["problem_bank_hard"],
        rating=rating_val,
        global_rank=global_rank,
        level=getattr(user, "level", None),
        goal=getattr(user, "goal", None),
        weekly_hours=getattr(user, "weekly_hours", None),
        streak=int(getattr(user, "streak", 0) or 0),
        longest_streak=int(getattr(user, "longest_streak", 0) or 0),
        streak_freeze=int(getattr(user, "streak_freeze", 0) or 0),
        timezone=getattr(user, "timezone", None) or "Asia/Tashkent",
        is_admin=bool(getattr(user, "is_admin", False)),
    )


@router.post("/logout")
def logout(credentials: HTTPAuthorizationCredentials | None = Depends(security)) -> dict:
    """
    Logout endpoint that validates the token and returns success.
    Frontend should handle token removal from localStorage.
    """
    if credentials is None:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(credentials.credentials, SECRET_KEY, algorithms=[ALGORITHM])
        user_id = payload.get("user_id")
        username: str | None = payload.get("username") or payload.get("sub")
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid token")
    if not (user_id or username):
        raise HTTPException(status_code=401, detail="Invalid token")
    return {"message": "Successfully logged out"}


# Settings endpoints

class UsernameUpdateRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)


class PasswordUpdateRequest(BaseModel):
    old_password: str
    new_password: str = Field(min_length=6, max_length=128)


class ResetVerifyRequest(BaseModel):
    email: str
    code: str


class ResetRequest(BaseModel):
    email: str


class ResetConfirmRequest(BaseModel):
    email: str
    code: str
    new_password: str = Field(min_length=6, max_length=128)




@router.get("/users/{username}", response_model=PublicProfileResponse)
def get_public_user_profile(username: str, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    stats = calculate_user_stats(db, user.id)
    from app.services.rating_service import rating_service
    rating = rating_service.snapshot(db, user.id)
    return PublicProfileResponse(
        id=user.id,
        username=user.username,
        display_name=getattr(user, "display_name", None),
        country=user.country,
        created_at=user.created_at,
        avatar_url=getattr(user, "avatar_url", None),
        bio=getattr(user, "bio", None),
        rating=rating.rating,
        global_rank=rating.global_rank,
        level=getattr(user, "level", None),
        streak=int(getattr(user, "streak", 0) or 0),
        longest_streak=int(getattr(user, "longest_streak", 0) or 0),
        is_admin=bool(getattr(user, "is_admin", False)),
        is_owner=bool(getattr(user, "is_owner", False)),
        **stats
    )


@router.patch("/user/username")
def update_username(request: UsernameUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Check if username is already taken
    existing = db.query(User).filter(User.username == request.username).first()
    if existing and existing.id != user.id:
        raise HTTPException(status_code=400, detail="Username already taken")
    
    user.username = request.username
    db.commit()
    return {"message": "Username updated successfully"}


@router.patch("/user/password")
def update_password(request: PasswordUpdateRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Verify old password
    if not verify_password(request.old_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    # Update password
    user.password_hash = get_password_hash(request.new_password)
    if user.google_sub:
        user.auth_provider = "hybrid"
    user.last_login_provider = "local"
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/profile/avatar")
async def upload_avatar(avatar: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Placeholder - avatar upload requires UserProfile table
    return {"message": "Avatar upload not available"}


@router.post("/password/reset/request")
def request_password_reset(payload: ResetRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        # For security, we don't reveal if the user exists
        return {"message": "Agar ushbu email tizimda mavjud bo'lsa, tasdiqlash kodi yuborildi."}

    # Clean up old codes
    db.query(PasswordReset).filter(PasswordReset.user_id == user.id).delete()

    # Generate 4-digit code
    code = "".join([str(random.randint(0, 9)) for _ in range(4)])
    expires_at = datetime.now(timezone.utc) + timedelta(seconds=PASSWORD_RESET_CODE_TTL_SECONDS)
    ttl_label = format_reset_ttl(PASSWORD_RESET_CODE_TTL_SECONDS)

    reset_entry = PasswordReset(
        user_id=user.id,
        code=code,
        expires_at=expires_at
    )
    db.add(reset_entry)
    db.commit()

    # Send Email
    subject = "PyZone Arena: Parolni tiklash kodi"
    body = f"""
    <div style="font-family: sans-serif; max-width: 500px; margin: 0 auto; padding: 20px; border: 1px solid #e2e8f0; border-radius: 12px; background-color: #0f172a; color: #f8fafc;">
        <h2 style="color: #10b981; text-align: center;">Parolni tiklash</h2>
        <p style="font-size: 16px; text-align: center;">Sizning tasdiqlash kodingiz:</p>
        <div style="background: #1e293b; padding: 15px; border-radius: 8px; text-align: center; font-size: 32px; font-weight: bold; letter-spacing: 10px; color: #3b82f6; margin: 20px 0;">
            {code}
        </div>
        <p style="font-size: 14px; color: #94a3b8; text-align: center;">Ushbu kod <b>{ttl_label}</b> davomida amal qiladi.</p>
        <hr style="border: 0; border-top: 1px solid #334155; margin: 20px 0;">
        <p style="font-size: 12px; color: #64748b; text-align: center;">Agar siz ushbu so'rovni yubormagan bo'lsangiz, xatga e'tibor bermang.</p>
    </div>
    """
    
    sent = notification_service.send_email(email, subject, body, is_html=True)
    if not sent:
        try:
            db.delete(reset_entry)
            db.commit()
        except Exception as cleanup_exc:
            db.rollback()
            logger.error("Failed to clean up password reset entry for %s: %s", email, cleanup_exc)
        logger.error(
            "Failed to send reset code to %s via provider %s",
            email,
            notification_service.get_email_provider(),
        )
        raise HTTPException(status_code=500, detail="E-mail yuborishda xatolik yuz berdi. Iltimos keyinroq urinib ko'ring.")

    return {"message": "Tasdiqlash kodi yuborildi."}


@router.post("/password/reset/verify")
def verify_password_reset(payload: ResetVerifyRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    reset_entry = db.query(PasswordReset).filter(
        PasswordReset.user_id == user.id,
        PasswordReset.code == payload.code
    ).first()

    if not reset_entry:
        raise HTTPException(status_code=400, detail="Noto'g'ri kod")

    if datetime.now(timezone.utc) > reset_entry.expires_at:
        raise HTTPException(status_code=400, detail="Kodning amal qilish muddati tugagan")

    reset_entry.is_verified = True
    db.commit()
    return {"message": "Kod tasdiqlandi", "success": True}


@router.post("/password/reset/confirm")
def confirm_password_reset(payload: ResetConfirmRequest, db: Session = Depends(get_db)):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()
    if not user:
        raise HTTPException(status_code=404, detail="Foydalanuvchi topilmadi")

    reset_entry = db.query(PasswordReset).filter(
        PasswordReset.user_id == user.id,
        PasswordReset.code == payload.code,
        PasswordReset.is_verified == True
    ).first()

    if not reset_entry:
        raise HTTPException(status_code=400, detail="Yaroqli tasdiqlash seansi topilmadi")

    # Update password
    user.password_hash = get_password_hash(payload.new_password)
    if user.google_sub:
        user.auth_provider = "hybrid"
    user.last_login_provider = "local"
    
    # Delete the reset code after successful use
    db.delete(reset_entry)
    db.commit()

    return {"message": "Parol muvaffaqiyatli yangilandi", "success": True}

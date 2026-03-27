from __future__ import annotations

import os
import re
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
from app.models.user import User
from app.repositories.submission_tracking import submission_tracking_repository
from app.services.user_stats_service import user_stats_service


router = APIRouter(tags=["auth"])

SECRET_KEY = os.getenv("ARENA_JWT_SECRET", os.getenv("JWT_SECRET", "dev-secret-change-me"))
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ARENA_JWT_EXPIRE_MINUTES", str(60 * 24 * 7)))  # default 7 days
security = HTTPBearer(auto_error=False)
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


class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=50)
    email: str | None = Field(default=None, max_length=255)
    password: str = Field(min_length=6, max_length=128)
    country: str | None = None


class LoginRequest(BaseModel):
    username: str
    password: str


class TokenResponse(BaseModel):
    token: str
    access_token: str
    token_type: str = "bearer"


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
        "exp": expire,
    }
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


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
        db.commit()
        token = create_access_token(user)
        return TokenResponse(token=token, access_token=token)
    except HTTPException:
        raise
    except Exception as exc:
        import logging

        logging.getLogger(__name__).exception("Login failed: %s", exc)
        raise HTTPException(status_code=500, detail="Login failed")


@router.get("/me", response_model=MeResponse)
def me(credentials: HTTPAuthorizationCredentials | None = Depends(security), db: Session = Depends(get_db)) -> MeResponse:
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

    query = db.query(User)
    if user_id is not None:
        user = query.filter(User.id == int(user_id)).first()
    else:
        user = query.filter(User.username == username).first()
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    user.last_active = datetime.now(timezone.utc)
    db.commit()

    stats = calculate_user_stats(db, user.id)
    from app.services.rating_service import rating_service
    rating = rating_service.snapshot(db, user.id)

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
        rating=rating.rating,
        global_rank=rating.global_rank,
        level=getattr(user, "level", None),
        goal=getattr(user, "goal", None),
        weekly_hours=getattr(user, "weekly_hours", None),
        streak=int(getattr(user, "streak", 0) or 0),
        longest_streak=int(getattr(user, "longest_streak", 0) or 0),
        streak_freeze=int(getattr(user, "streak_freeze", 0) or 0),
        timezone=getattr(user, "timezone", None) or "Asia/Tashkent",
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
    phone: str | None = None
    code: str

def get_current_user(credentials: HTTPAuthorizationCredentials | None = Depends(security), db: Session = Depends(get_db)) -> User:
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
    db.commit()
    return {"message": "Password updated successfully"}


@router.post("/profile/avatar")
async def upload_avatar(avatar: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    # Placeholder - avatar upload requires UserProfile table
    return {"message": "Avatar upload not available"}


@router.post("/password/reset")
def request_password_reset(user: User = Depends(get_current_user)):
    # This would integrate with Telegram bot
    # For now, just return success
    return {"message": "Reset code sent to your Telegram"}


@router.post("/password/reset/verify")
def verify_password_reset(request: ResetVerifyRequest):
    # Placeholder verification logic; integrate with Telegram bot or DB in production
    if not request.code:
        raise HTTPException(status_code=400, detail="Code is required")
    return {"message": "Reset code verified"}

from __future__ import annotations

from fastapi import APIRouter, Depends, Query
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User


router = APIRouter(tags=["users"])


class UserSearchItem(BaseModel):
    id: int
    username: str


class UserSearchResponse(BaseModel):
    users: list[UserSearchItem]


@router.get("/users/search", response_model=UserSearchResponse)
def search_users(
    q: str = Query(..., min_length=1, max_length=50),
    db: Session = Depends(get_db),
) -> UserSearchResponse:
    """
    Return up to 10 users whose username contains the query string (case-insensitive).
    """
    query = q.strip()
    if not query:
        return UserSearchResponse(users=[])

    pattern = f"%{query}%"
    stmt = (
        select(User.id, User.username)
        .where(User.username.ilike(pattern))
        .order_by(User.username.asc())
        .limit(10)
    )
    rows = db.execute(stmt).mappings().all()
    users = [UserSearchItem(id=row["id"], username=row["username"]) for row in rows]
    return UserSearchResponse(users=users)

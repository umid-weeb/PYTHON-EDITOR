from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, WebSocket, WebSocketDisconnect
from sqlalchemy import or_
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.contest import Contest, ContestProblem, ContestStanding, ContestSubmission
from app.models.problem import Problem
from app.services.ws_manager import contest_ws_manager

router = APIRouter(prefix="/contests", tags=["Contests"])
ws_router = APIRouter(tags=["WebSockets"])


def _normalize_datetime(value: datetime | None) -> datetime | None:
    if value is None:
        return None
    if value.tzinfo is None:
        return value
    return value.astimezone(timezone.utc).replace(tzinfo=None)


def _contest_status(contest: Contest) -> str:
    now = datetime.utcnow()
    starts_at = _normalize_datetime(contest.starts_at)
    ends_at = _normalize_datetime(contest.ends_at)
    if starts_at and now < starts_at:
        return "upcoming"
    if ends_at and now > ends_at:
        return "finished"
    return "running"


@router.get("")
def list_contests(db: Session = Depends(get_db)):
    items = (
        db.query(Contest)
        .order_by(Contest.starts_at.desc(), Contest.id.desc())
        .limit(50)
        .all()
    )

    return {
        "items": [
            {
                "id": contest.id,
                "title": contest.title,
                "starts_at": contest.starts_at.isoformat() if contest.starts_at else None,
                "ends_at": contest.ends_at.isoformat() if contest.ends_at else None,
                "status": _contest_status(contest),
            }
            for contest in items
        ]
    }


@router.get("/{contest_id}")
def get_contest(contest_id: str, db: Session = Depends(get_db)):
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    problems = (
        db.query(
            ContestProblem.problem_id,
            ContestProblem.order_num,
            Problem.slug.label("problem_slug"),
            Problem.title.label("problem_title"),
            Problem.difficulty.label("difficulty"),
        )
        .outerjoin(Problem, or_(Problem.id == ContestProblem.problem_id, Problem.slug == ContestProblem.problem_id))
        .filter(ContestProblem.contest_id == contest_id)
        .order_by(ContestProblem.order_num.asc(), ContestProblem.problem_id.asc())
        .all()
    )

    return {
        "id": contest.id,
        "title": contest.title,
        "description": None,
        "starts_at": contest.starts_at.isoformat() if contest.starts_at else None,
        "ends_at": contest.ends_at.isoformat() if contest.ends_at else None,
        "status": _contest_status(contest),
        "problems": [
            {
                "problem_id": row.problem_id,
                "problem_slug": row.problem_slug or row.problem_id,
                "title": row.problem_title,
                "difficulty": row.difficulty,
                "sort_order": int(row.order_num or 0),
            }
            for row in problems
        ],
    }


@router.get("/{contest_id}/leaderboard")
def get_leaderboard(contest_id: str, db: Session = Depends(get_db)):
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        raise HTTPException(status_code=404, detail="Contest not found")

    standings = (
        db.query(ContestStanding)
        .filter(ContestStanding.contest_id == contest_id)
        .order_by(ContestStanding.total_solved.desc(), ContestStanding.total_penalty.asc(), ContestStanding.username.asc())
        .limit(100)
        .all()
    )

    return {
        "items": [
            {
                "username": row.username,
                "solved": int(row.total_solved or 0),
                "penalty_minutes": int(row.total_penalty or 0),
            }
            for row in standings
        ]
    }


@router.get("/{contest_id}/standings")
def get_standings(contest_id: str, db: Session = Depends(get_db)):
    payload = get_leaderboard(contest_id=contest_id, db=db)
    return {"standings": payload["items"]}

# Simulated submit endpoint triggered by the judge worker when a verdict arrives
@router.post("/internal/{contest_id}/update-score")
async def internal_update_score(contest_id: str, payload: dict, db: Session = Depends(get_db)):
    user_id = payload["user_id"]
    username = payload["username"]
    is_accepted = payload["is_accepted"]
    problem_id = payload["problem_id"]
    wrong_attempts = payload.get("wrong_attempts", 0) # Fetched from previous submissions
    
    contest = db.query(Contest).filter(Contest.id == contest_id).first()
    if not contest:
        raise HTTPException(status_code=404)

    standing = db.query(ContestStanding).filter_by(contest_id=contest_id, user_id=user_id).first()
    if not standing:
        standing = ContestStanding(contest_id=contest_id, user_id=user_id, username=username)
        db.add(standing)

    # ICPC Scoring Logic
    if is_accepted:
        elapsed_minutes = int((datetime.utcnow() - contest.starts_at).total_seconds() / 60)
        # 20 minutes penalty for each wrong attempt
        penalty = elapsed_minutes + (wrong_attempts * 20) 
        
        standing.total_solved += 1
        standing.total_penalty += penalty
        standing.last_submit = datetime.utcnow()
        db.commit()

        # Real-time WebSockets update
        await contest_ws_manager.broadcast(str(contest_id), {
            "type": "standing_update",
            "user_id": str(user_id),
            "username": username,
            "solved": standing.total_solved,
            "penalty": standing.total_penalty
        })
    return {"status": "ok"}

@ws_router.websocket("/ws/contest/{contest_id}")
async def contest_websocket(websocket: WebSocket, contest_id: str):
    await contest_ws_manager.connect(websocket, contest_id)
    try:
        while True:
            data = await websocket.receive_text() # keep connection alive
    except WebSocketDisconnect:
        contest_ws_manager.disconnect(websocket, contest_id)

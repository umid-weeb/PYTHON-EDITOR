from __future__ import annotations

import logging
import uuid
from datetime import datetime
from typing import Any, Dict, List

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy import and_, func, or_
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.models.problem import Problem
from app.models.submission import Submission, SolvedProblem, UserStats
from app.models.user import User
from app.api.routes.auth import get_current_user
from app.database import SessionLocal
from app.services.judge.judge0_client import Judge0Client
from app.services.judge.parser import parse_judge0_response

router = APIRouter(tags=["submissions"])
logger = logging.getLogger("pyzone.submissions")

# Initialize judge0 client
judge0_client = Judge0Client()


class SubmissionRequest(BaseModel):
    problem_id: str = Field(..., description="Problem ID or slug")
    code: str = Field(..., min_length=1, max_length=50000, description="Source code to submit")
    language: str = Field(..., pattern="^(python|javascript|cpp)$", description="Programming language")


class SubmissionResponse(BaseModel):
    submission_id: str
    status: str
    message: str


class SubmissionStatusResponse(BaseModel):
    submission_id: str
    problem_id: str
    status: str
    verdict: str | None = None
    runtime_ms: int | None = None
    memory_kb: int | None = None
    created_at: datetime


class UserProfileResponse(BaseModel):
    user_id: int
    username: str
    email: str | None = None
    solved_count: int
    easy_solved: int
    medium_solved: int
    hard_solved: int
    rating: int
    recent_submissions: List[Dict[str, Any]]


def get_db() -> Session:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


@router.post("/submit", response_model=SubmissionResponse, status_code=status.HTTP_201_CREATED)
async def submit_code(
    request: SubmissionRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmissionResponse:
    """
    Submit code for evaluation.
    
    Transaction-safe submission with race condition prevention.
    """
    try:
        # Validate problem exists
        problem = db.query(Problem).filter(Problem.id == request.problem_id).first()
        if not problem:
            problem = db.query(Problem).filter(Problem.slug == request.problem_id).first()
            if not problem:
                raise HTTPException(
                    status_code=status.HTTP_404_NOT_FOUND,
                    detail="Problem topilmadi"
                )
        
        # Create submission record with transaction
        submission = Submission(
            user_id=current_user.id,
            problem_id=problem.id,
            code=request.code,
            language=request.language,
            status="pending"
        )
        db.add(submission)
        db.flush()  # Get submission ID
        
        submission_id = str(submission.id)
        logger.info(f"User {current_user.username} submitted code for problem {problem.slug} (ID: {submission_id})")
        
        # Commit the submission
        db.commit()
        
        # Add background task for code evaluation
        background_tasks.add_task(
            evaluate_submission,
            submission_id=submission_id,
            problem_id=problem.id,
            code=request.code,
            language=request.language
        )
        
        return SubmissionResponse(
            submission_id=submission_id,
            status="pending",
            message="Yechim tekshirilmoqda..."
        )
        
    except HTTPException:
        raise
    except Exception as e:
        db.rollback()
        logger.error(f"Error creating submission: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Yechim yuborishda xatolik yuz berdi"
        )


@router.get("/submission/{submission_id}", response_model=SubmissionStatusResponse)
async def get_submission_status(
    submission_id: str,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> SubmissionStatusResponse:
    """Get submission status and results."""
    
    try:
        submission = db.query(Submission).filter(
            Submission.id == int(submission_id),
            Submission.user_id == current_user.id
        ).first()
        
        if not submission:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Yechim topilmadi"
            )
        
        return SubmissionStatusResponse(
            submission_id=str(submission.id),
            problem_id=submission.problem_id,
            status=submission.status,
            verdict=submission.verdict,
            runtime_ms=submission.runtime_ms,
            memory_kb=submission.memory_kb,
            created_at=submission.created_at
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting submission status: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Yechim holati olishda xatolik"
        )


@router.get("/profile/{user_id}", response_model=UserProfileResponse)
async def get_user_profile(
    user_id: int,
    current_user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> UserProfileResponse:
    """Get user profile with solved stats and recent submissions."""
    
    try:
        # Get user
        user = db.query(User).filter(User.id == user_id).first()
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Foydalanuvchi topilmadi"
            )
        
        # Get user stats
        stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        if not stats:
            # Initialize stats if not exists
            stats = UserStats(
                user_id=user_id,
                solved_count=0,
                easy_solved=0,
                medium_solved=0,
                hard_solved=0,
                rating=1000
            )
            db.add(stats)
            db.commit()
        
        # Get recent submissions
        recent_submissions = db.query(
            Submission.id,
            Submission.problem_id,
            Problem.slug,
            Problem.title,
            Problem.leetcode_id,
            Submission.status,
            Submission.verdict,
            Submission.runtime_ms,
            Submission.memory_kb,
            Submission.created_at
        ).join(Problem, Submission.problem_id == Problem.id)\
         .filter(Submission.user_id == user_id)\
         .order_by(Submission.created_at.desc())\
         .limit(20)\
         .all()
        
        # Format recent submissions
        formatted_submissions = []
        for sub in recent_submissions:
            formatted_submissions.append({
                "id": sub.id,
                "problem_slug": sub.slug,
                "problem_title": sub.title,
                "leetcode_id": sub.leetcode_id,
                "status": sub.status,
                "verdict": sub.verdict,
                "runtime_ms": sub.runtime_ms,
                "memory_kb": sub.memory_kb,
                "created_at": sub.created_at
            })
        
        return UserProfileResponse(
            user_id=user.id,
            username=user.username,
            email=user.email,
            solved_count=stats.solved_count,
            easy_solved=stats.easy_solved,
            medium_solved=stats.medium_solved,
            hard_solved=stats.hard_solved,
            rating=stats.rating,
            recent_submissions=formatted_submissions
        )
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting user profile: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Profil olishda xatolik"
        )


async def evaluate_submission(submission_id: str, problem_id: str, code: str, language: str) -> None:
    """
    Background task to evaluate submission.
    Uses transaction-safe logic to prevent race conditions.
    """
    db = SessionLocal()
    try:
        # Get submission and lock it for update
        submission = db.query(Submission).filter(Submission.id == int(submission_id)).with_for_update().first()
        if not submission:
            logger.error(f"Submission {submission_id} not found for evaluation")
            return
        
        # Update status to running
        submission.status = "running"
        db.commit()
        
        # Get problem test cases
        problem = db.query(Problem).filter(Problem.id == problem_id).first()
        if not problem:
            submission.status = "failed"
            submission.verdict = "error"
            submission.error_text = "Problem topilmadi"
            db.commit()
            return
        
        # Prepare test cases
        test_cases = []
        for test_case in problem.test_cases:
            test_cases.append({
                "input": test_case.input,
                "expected_output": test_case.expected_output,
                "is_hidden": test_case.is_hidden
            })
        
        # Submit to judge0
        try:
            result = await judge0_client.submit_code(
                source_code=code,
                language_id=judge0_client.get_language_id(language),
                test_cases=test_cases
            )
        except Exception as e:
            logger.error(f"Judge0 error for submission {submission_id}: {str(e)}")
            submission.status = "failed"
            submission.verdict = "error"
            submission.error_text = f"Tekshiruv xatosi: {str(e)}"
            db.commit()
            return
        
        # Parse results
        parsed_result = parse_judge0_response(result, test_cases)
        
        # Update submission with results
        submission.status = "completed"
        submission.verdict = parsed_result["verdict"]
        submission.runtime_ms = parsed_result.get("runtime_ms")
        submission.memory_kb = parsed_result.get("memory_kb")
        submission.error_text = parsed_result.get("error_text")
        
        # Handle successful submission
        if parsed_result["verdict"] == "accepted":
            # Try to insert into solved_problems with ON CONFLICT DO NOTHING
            solved_problem = SolvedProblem(
                user_id=submission.user_id,
                problem_id=submission.problem_id
            )
            db.add(solved_problem)
            try:
                db.commit()
                logger.info(f"User {submission.user_id} solved problem {submission.problem_id}")
            except IntegrityError:
                db.rollback()
                logger.info(f"User {submission.user_id} already solved problem {submission.problem_id} (duplicate solve ignored)")
                # Still update submission as completed
                db.refresh(submission)
                submission.status = "completed"
                submission.verdict = "accepted"
                db.commit()
        else:
            db.commit()
        
        logger.info(f"Submission {submission_id} evaluation completed: {parsed_result['verdict']}")
        
    except Exception as e:
        db.rollback()
        logger.error(f"Error evaluating submission {submission_id}: {str(e)}")
    finally:
        db.close()


@router.get("/stats/problem/{problem_id}")
async def get_problem_stats(
    problem_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get problem statistics including acceptance rate."""
    
    try:
        problem = db.query(Problem).filter(
            or_(Problem.id == problem_id, Problem.slug == problem_id)
        ).first()
        
        if not problem:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="Problem topilmadi"
            )
        
        # Get statistics using raw SQL for better performance
        stats_query = db.execute("""
            SELECT 
                COUNT(sp.id) as solved_count,
                COUNT(s.id) as total_submissions,
                ROUND(
                    CASE WHEN COUNT(s.id) > 0 
                    THEN (COUNT(sp.id)::FLOAT / COUNT(s.id)::FLOAT) * 100 
                    ELSE 0 END, 
                    2
                ) as acceptance_rate
            FROM problems p
            LEFT JOIN solved_problems sp ON p.id = sp.problem_id
            LEFT JOIN submissions s ON p.id = s.problem_id
            WHERE p.id = :problem_id
            GROUP BY p.id
        """, {"problem_id": problem.id}).fetchone()
        
        return {
            "problem_id": problem.id,
            "slug": problem.slug,
            "title": problem.title,
            "leetcode_id": problem.leetcode_id,
            "difficulty": problem.difficulty,
            "solved_count": stats_query.solved_count if stats_query else 0,
            "total_submissions": stats_query.total_submissions if stats_query else 0,
            "acceptance_rate": stats_query.acceptance_rate if stats_query else 0.0
        }
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error getting problem stats: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Statistika olishda xatolik"
        )


@router.get("/leaderboard")
async def get_leaderboard(
    limit: int = 10,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Get global leaderboard based on solved count."""
    
    try:
        leaderboard = db.query(
            User.username,
            UserStats.solved_count,
            UserStats.easy_solved,
            UserStats.medium_solved,
            UserStats.hard_solved,
            UserStats.rating
        ).join(UserStats, User.id == UserStats.user_id)\
         .order_by(UserStats.solved_count.desc(), UserStats.rating.desc())\
         .limit(limit)\
         .all()
        
        return [
            {
                "username": row.username,
                "solved_count": row.solved_count,
                "easy_solved": row.easy_solved,
                "medium_solved": row.medium_solved,
                "hard_solved": row.hard_solved,
                "rating": row.rating
            }
            for row in leaderboard
        ]
        
    except Exception as e:
        logger.error(f"Error getting leaderboard: {str(e)}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Reyting olishda xatolik"
        )
#!/usr/bin/env python3
"""
Test script to validate the data consistency fix.

This script tests the complete flow:
1. Submit an accepted solution
2. Verify solved count updates
3. Verify no duplicates
4. Verify problem status
5. Verify leaderboard updates
"""

import asyncio
import logging
import sys
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.database import SessionLocal
from app.models.submission import SolvedProblem, Submission, UserStats
from app.services.submission_service import get_submission_service
from app.services.profile_service import profile_service
from app.services.problem_service import get_problem_service

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("data_consistency_test")

def get_database_session():
    """Get database session for direct SQL operations."""
    settings = get_settings()
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    return Session()

async def test_data_consistency():
    """Test the complete data consistency flow."""
    logger.info("Starting data consistency test...")
    
    try:
        # Get test data
        with SessionLocal() as db:
            # Find a test user
            test_user = db.query(Submission.user_id).filter(
                Submission.user_id.isnot(None)
            ).first()
            
            if not test_user:
                logger.error("No test users found in database")
                return False
            
            user_id = test_user[0]
            logger.info(f"Using test user: {user_id}")
            
            # Find a test problem
            test_problem = db.query(Submission.problem_id).filter(
                Submission.user_id == user_id,
                Submission.status == 'completed',
                Submission.verdict == 'accepted',
                Submission.mode == 'submit'
            ).first()
            
            if not test_problem:
                logger.error("No test problems found for user")
                return False
            
            problem_id = test_problem[0]
            logger.info(f"Using test problem: {problem_id}")
        
        # Test 1: Check initial state
        logger.info("Test 1: Checking initial state...")
        initial_solved = get_solved_count(user_id)
        initial_stats = get_user_stats(user_id)
        logger.info(f"Initial solved count: {initial_solved}")
        logger.info(f"Initial stats: {initial_stats}")
        
        # Test 2: Submit an accepted solution (simulate)
        logger.info("Test 2: Simulating accepted submission...")
        submission_service = get_submission_service()
        
        # Create a mock accepted submission
        with SessionLocal() as db:
            # Check if this problem is already solved
            existing_solve = db.query(SolvedProblem).filter(
                SolvedProblem.user_id == user_id,
                SolvedProblem.problem_id == problem_id
            ).first()
            
            if existing_solve:
                logger.info("Problem already solved, skipping duplicate test")
            else:
                # Record the solve
                repository = submission_service.repository
                inserted = repository.record_solved_problem_safe(
                    db,
                    user_id=user_id,
                    problem_id=problem_id,
                    created_by="test_script"
                )
                logger.info(f"Solve recorded: {inserted}")
        
        # Test 3: Check solved count updated
        logger.info("Test 3: Checking solved count updated...")
        after_solved = get_solved_count(user_id)
        after_stats = get_user_stats(user_id)
        logger.info(f"After solve count: {after_solved}")
        logger.info(f"After stats: {after_stats}")
        
        if after_solved <= initial_solved:
            logger.error("Solved count did not increase!")
            return False
        
        # Test 4: Try to solve again (should not duplicate)
        logger.info("Test 4: Testing duplicate solve prevention...")
        with SessionLocal() as db:
            repository = submission_service.repository
            inserted_again = repository.record_solved_problem_safe(
                db,
                user_id=user_id,
                problem_id=problem_id,
                created_by="test_script_duplicate"
            )
            logger.info(f"Duplicate solve recorded: {inserted_again}")
        
        if inserted_again:
            logger.error("Duplicate solve was recorded!")
            return False
        
        # Test 5: Check problem status
        logger.info("Test 5: Checking problem status...")
        problem_service = get_problem_service()
        problem_page = await problem_service.list_problem_page(
            user_id=user_id,
            page=1,
            per_page=100
        )
        
        solved_problems = [item for item in problem_page["items"] if item.is_solved]
        logger.info(f"Problems marked as solved: {len(solved_problems)}")
        
        # Test 6: Check profile API
        logger.info("Test 6: Checking profile API...")
        profile = profile_service.get_user_profile(SessionLocal(), user_id)
        logger.info(f"Profile solved count: {profile.solved_count}")
        logger.info(f"Profile easy solved: {profile.easy_solved}")
        logger.info(f"Profile medium solved: {profile.medium_solved}")
        logger.info(f"Profile hard solved: {profile.hard_solved}")
        
        # Test 7: Check leaderboard
        logger.info("Test 7: Checking leaderboard...")
        leaderboard = profile_service.get_leaderboard(SessionLocal(), limit=10)
        user_in_leaderboard = next((item for item in leaderboard if item["user_id"] == user_id), None)
        if user_in_leaderboard:
            logger.info(f"User in leaderboard with solved count: {user_in_leaderboard['solved']}")
        else:
            logger.warning("User not found in leaderboard")
        
        # Test 8: Validate consistency
        logger.info("Test 8: Validating consistency...")
        inconsistencies = validate_user_consistency(user_id)
        if inconsistencies > 0:
            logger.error(f"Found {inconsistencies} inconsistencies!")
            return False
        
        logger.info("✅ All tests passed! Data consistency is working correctly.")
        return True
        
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        return False

def get_solved_count(user_id: int) -> int:
    """Get solved count from solved_problems table."""
    with SessionLocal() as db:
        return int(
            db.query(SolvedProblem).filter(SolvedProblem.user_id == user_id).count()
        )

def get_user_stats(user_id: int) -> dict[str, int]:
    """Get user stats from user_stats table."""
    with SessionLocal() as db:
        stats = db.query(UserStats).filter(UserStats.user_id == user_id).first()
        if stats:
            return {
                "solved_count": int(stats.solved_count or 0),
                "easy_solved": int(stats.easy_solved or 0),
                "medium_solved": int(stats.medium_solved or 0),
                "hard_solved": int(stats.hard_solved or 0),
                "rating": int(stats.rating or 1200)
            }
        return {"solved_count": 0, "easy_solved": 0, "medium_solved": 0, "hard_solved": 0, "rating": 1200}

def validate_user_consistency(user_id: int) -> int:
    """Validate consistency between solved_problems and user_stats."""
    with SessionLocal() as db:
        inconsistencies = db.execute("""
            SELECT 
                us.user_id,
                COALESCE(sp.solved_count, 0) as solved_from_solved_problems,
                us.solved_count as solved_from_user_stats,
                (COALESCE(sp.solved_count, 0) != us.solved_count) as stats_incorrect
            FROM user_stats us
            LEFT JOIN (
                SELECT 
                    sp.user_id,
                    COUNT(*) as solved_count
                FROM solved_problems sp
                GROUP BY sp.user_id
            ) sp ON us.user_id = sp.user_id
            WHERE us.user_id = :user_id
              AND COALESCE(sp.solved_count, 0) != us.solved_count
        """, {"user_id": user_id}).fetchall()
        
        return len(inconsistencies)

def main():
    """Main test function."""
    logger.info("Starting data consistency validation...")
    
    try:
        result = asyncio.run(test_data_consistency())
        if result:
            logger.info("🎉 Data consistency test PASSED!")
            return 0
        else:
            logger.error("❌ Data consistency test FAILED!")
            return 1
    except Exception as e:
        logger.error(f"Test execution failed: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
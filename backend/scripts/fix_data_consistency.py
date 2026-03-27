#!/usr/bin/env python3
"""
Migration script to fix data consistency issues in the submission system.

This script:
1. Backfills solved_problems table from existing accepted submissions
2. Rebuilds user_stats from solved_problems (source of truth)
3. Validates data consistency
4. Provides debugging information
"""

import logging
import sys
from typing import Any

from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from app.core.config import get_settings
from app.database import Base
from app.models.submission import SolvedProblem, Submission, UserStats
from app.repositories.submission_tracking import submission_tracking_repository

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s'
)
logger = logging.getLogger("data_consistency_fix")

def get_database_session():
    """Get database session for direct SQL operations."""
    settings = get_settings()
    engine = create_engine(settings.database_url)
    Session = sessionmaker(bind=engine)
    return Session()

def backfill_solved_problems():
    """Backfill solved_problems table from existing accepted submissions."""
    logger.info("Starting backfill of solved_problems table...")
    
    with get_database_session() as db:
        # Get all users with accepted submissions
        users_with_accepted = db.query(Submission.user_id).filter(
            Submission.user_id.isnot(None),
            Submission.status == 'completed',
            Submission.verdict == 'accepted',
            Submission.mode == 'submit'
        ).distinct().all()
        
        total_users = len(users_with_accepted)
        logger.info(f"Found {total_users} users with accepted submissions")
        
        total_inserted = 0
        for i, (user_id,) in enumerate(users_with_accepted):
            try:
                inserted = submission_tracking_repository.backfill_solved_problems_for_user(db, user_id)
                total_inserted += inserted
                logger.info(f"User {user_id}: {inserted} problems backfilled ({i+1}/{total_users})")
            except Exception as e:
                logger.error(f"Error backfilling user {user_id}: {e}")
                continue
        
        logger.info(f"Backfill completed. Total problems inserted: {total_inserted}")
        return total_inserted

def rebuild_user_stats():
    """Rebuild user_stats table from solved_problems (source of truth)."""
    logger.info("Rebuilding user_stats from solved_problems...")
    
    with get_database_session() as db:
        # Get all users with solved problems
        users_with_solved = db.query(SolvedProblem.user_id).distinct().all()
        total_users = len(users_with_solved)
        logger.info(f"Found {total_users} users with solved problems")
        
        for i, (user_id,) in enumerate(users_with_solved):
            try:
                # Rebuild stats from solved_problems
                submission_tracking_repository.rebuild_user_stats(db, user_id)
                logger.info(f"User {user_id}: stats rebuilt ({i+1}/{total_users})")
            except Exception as e:
                logger.error(f"Error rebuilding stats for user {user_id}: {e}")
                continue
        
        logger.info("User stats rebuild completed")

def validate_consistency():
    """Validate data consistency between solved_problems and user_stats."""
    logger.info("Validating data consistency...")
    
    with get_database_session() as db:
        # Check for inconsistencies
        inconsistencies = db.execute("""
            SELECT 
                us.user_id,
                COALESCE(sp.solved_count, 0) as solved_from_solved_problems,
                us.solved_count as solved_from_user_stats,
                (COALESCE(sp.solved_count, 0) != us.solved_count) as stats_incorrect,
                COALESCE(sp.easy_count, 0) as easy_from_solved,
                us.easy_solved as easy_from_stats,
                COALESCE(sp.medium_count, 0) as medium_from_solved,
                us.medium_solved as medium_from_stats,
                COALESCE(sp.hard_count, 0) as hard_from_solved,
                us.hard_solved as hard_from_stats
            FROM user_stats us
            LEFT JOIN (
                SELECT 
                    sp.user_id,
                    COUNT(*) as solved_count,
                    COUNT(*) FILTER (WHERE p.difficulty = 'easy') as easy_count,
                    COUNT(*) FILTER (WHERE p.difficulty = 'medium') as medium_count,
                    COUNT(*) FILTER (WHERE p.difficulty = 'hard') as hard_count
                FROM solved_problems sp
                JOIN problems p ON sp.problem_id = p.id
                GROUP BY sp.user_id
            ) sp ON us.user_id = sp.user_id
            WHERE COALESCE(sp.solved_count, 0) != us.solved_count
               OR COALESCE(sp.easy_count, 0) != us.easy_solved
               OR COALESCE(sp.medium_count, 0) != us.medium_solved
               OR COALESCE(sp.hard_count, 0) != us.hard_solved
        """).fetchall()
        
        if inconsistencies:
            logger.warning(f"Found {len(inconsistencies)} inconsistent user records:")
            for row in inconsistencies:
                logger.warning(f"  User {row.user_id}: "
                             f"solved_problems={row.solved_from_solved_problems}, "
                             f"user_stats={row.solved_from_user_stats}, "
                             f"easy_problems={row.easy_from_solved}, "
                             f"easy_stats={row.easy_from_stats}, "
                             f"medium_problems={row.medium_from_solved}, "
                             f"medium_stats={row.medium_from_stats}, "
                             f"hard_problems={row.hard_from_solved}, "
                             f"hard_stats={row.hard_from_stats}")
        else:
            logger.info("All user records are consistent!")
        
        return len(inconsistencies)

def get_statistics():
    """Get current statistics about the system."""
    logger.info("Getting system statistics...")
    
    with get_database_session() as db:
        # Count submissions
        total_submissions = db.query(Submission).count()
        accepted_submissions = db.query(Submission).filter(
            Submission.status == 'completed',
            Submission.verdict == 'accepted',
            Submission.mode == 'submit'
        ).count()
        
        # Count solved problems
        total_solved = db.query(SolvedProblem).count()
        
        # Count users with solved problems
        users_with_solved = db.query(SolvedProblem.user_id).distinct().count()
        
        # Count user stats
        total_user_stats = db.query(UserStats).count()
        
        stats = {
            "total_submissions": total_submissions,
            "accepted_submissions": accepted_submissions,
            "total_solved_problems": total_solved,
            "users_with_solved_problems": users_with_solved,
            "total_user_stats": total_user_stats
        }
        
        logger.info(f"System statistics: {stats}")
        return stats

def main():
    """Main migration function."""
    logger.info("Starting data consistency fix migration...")
    
    try:
        # Step 1: Get current statistics
        stats_before = get_statistics()
        
        # Step 2: Backfill solved_problems
        backfilled_count = backfill_solved_problems()
        
        # Step 3: Rebuild user_stats
        rebuild_user_stats()
        
        # Step 4: Validate consistency
        inconsistencies = validate_consistency()
        
        # Step 5: Get final statistics
        stats_after = get_statistics()
        
        # Summary
        logger.info("=" * 60)
        logger.info("MIGRATION SUMMARY")
        logger.info("=" * 60)
        logger.info(f"Problems backfilled: {backfilled_count}")
        logger.info(f"Inconsistencies found: {inconsistencies}")
        logger.info(f"Submissions before: {stats_before['total_submissions']}")
        logger.info(f"Submissions after: {stats_after['total_submissions']}")
        logger.info(f"Solved problems before: {stats_before['total_solved_problems']}")
        logger.info(f"Solved problems after: {stats_after['total_solved_problems']}")
        logger.info(f"Users with solved problems: {stats_after['users_with_solved_problems']}")
        logger.info("=" * 60)
        
        if inconsistencies == 0:
            logger.info("✅ Migration completed successfully! Data consistency is now ensured.")
            return 0
        else:
            logger.warning(f"⚠️  Migration completed with {inconsistencies} inconsistencies. Manual review may be needed.")
            return 1
            
    except Exception as e:
        logger.error(f"Migration failed with error: {e}")
        return 1

if __name__ == "__main__":
    sys.exit(main())
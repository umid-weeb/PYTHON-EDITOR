from __future__ import annotations
import sys
from pathlib import Path

# Add backend to sys.path
backend_root = Path(__file__).resolve().parents[1]
if str(backend_root) not in sys.path:
    sys.path.insert(0, str(backend_root))

from app.database import SessionLocal
from app.models.problem import Problem, TestCase
from app.models.submission import Submission, SolvedProblem
from app.services.problem_catalog import _templates

def cleanup_duplicates():
    session = SessionLocal()
    try:
        templates = _templates()
        for template in templates:
            prefix = template.slug_prefix
            max_vars = template.variations
            
            print(f"Checking {prefix} (max allowed variations: {max_vars})...")
            
            # Find the "master" problem (variation 01)
            master_slug = f"{prefix}-01"
            master = session.query(Problem).filter(Problem.slug == master_slug).first()
            if not master:
                print(f"  Master {master_slug} not found, skipping.")
                continue
            
            # Find excess variations (from max_vars + 1 to 10)
            # Actually, just find any variation > max_vars
            excess_problems = session.query(Problem).filter(
                Problem.slug.like(f"{prefix}-%"),
                Problem.slug != master_slug
            ).all()
            
            for p in excess_problems:
                # Extract variation index from slug
                try:
                    var_idx = int(p.slug.split("-")[-1])
                except (ValueError, IndexError):
                    continue
                
                if var_idx > max_vars:
                    print(f"  Found excess duplicate: {p.slug} (ID: {p.id})")
                    
                    # 1. Re-link submissions
                    sub_count = session.query(Submission).filter(Submission.problem_id == p.id).update(
                        {Submission.problem_id: master.id}
                    )
                    if sub_count:
                        print(f"    Re-linked {sub_count} submissions to {master.slug}")
                    
                    # 2. Re-link solved records
                    # Handle potential unique constraint (user_id, problem_id) violations
                    solved_records = session.query(SolvedProblem).filter(SolvedProblem.problem_id == p.id).all()
                    for sr in solved_records:
                        # Check if user already has a solved record for the master problem
                        exists = session.query(SolvedProblem).filter(
                            SolvedProblem.user_id == sr.user_id,
                            SolvedProblem.problem_id == master.id
                        ).first()
                        if exists:
                            # User already solved the master, just delete the duplicate solved record
                            session.delete(sr)
                        else:
                            # User hasn't solved the master yet, update the problem_id
                            sr.problem_id = master.id
                        
                        # Flush to ensure unique constraint checks in next iterations see the change
                        session.flush()
                    
                    if solved_records:
                        print(f"    Processed {len(solved_records)} solved records for {p.slug}")
                    
                    # 3. Delete the duplicate problem (cascades to TestCases)
                    session.delete(p)
                    print(f"    Deleted problem {p.slug}")
        
        session.commit()
        print("\nCleanup completed successfully.")
        
    except Exception as e:
        session.rollback()
        print(f"Error during cleanup: {e}")
        raise
    finally:
        session.close()

if __name__ == "__main__":
    cleanup_duplicates()

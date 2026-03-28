import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

# Try to load from environment or .env
load_dotenv("backend/.env")
DATABASE_URL = os.getenv("DATABASE_URL")

if not DATABASE_URL:
    print("ERROR: DATABASE_URL not found")
    exit(1)

engine = create_engine(DATABASE_URL)

def dedupe():
    with engine.connect() as conn:
        # 1. Find duplicate emails (case insensitive grouping)
        print("\n--- Searching for Duplicate Emails ---")
        dupes = conn.execute(text("""
            SELECT LOWER(email), COUNT(*) FROM users GROUP BY LOWER(email) HAVING COUNT(*) > 1
        """)).all()
        
        if not dupes:
            print("No duplicate emails found.")
            return

        for (email_lower, count) in dupes:
            print(f"Processing email (lower): {email_lower} (Count: {count})")
            # Get IDs for this email
            user_rows = conn.execute(text("SELECT id, username, email FROM users WHERE LOWER(email) = :email"), {"email": email_lower}).all()
            user_ids = [r[0] for r in user_rows]
            
            if not user_ids:
                print(f"  Warning: No users found for {email_lower} despite being in group.")
                continue

            # Find which one has more submissions
            counts = []
            for uid in user_ids:
                num_subs = conn.execute(text("SELECT COUNT(*) FROM submissions WHERE user_id = :uid"), {"uid": uid}).scalar()
                counts.append((uid, num_subs))
            
            # Sort by count desc
            counts.sort(key=lambda x: x[1], reverse=True)
            keep_id, keep_count = counts[0]
            to_delete = [uid for uid, c in counts[1:]]
            
            print(f"  Keeping ID: {keep_id} (Submissions: {keep_count})")
            for del_id in to_delete:
                print(f"  Deleting ID: {del_id}")
                # Use raw SQL to merge activity
                # Check for existing SolvedProblem entry to avoid PK violation on merge
                conn.execute(text("""
                    UPDATE submissions SET user_id = :keep 
                    WHERE user_id = :del
                """), {"keep": keep_id, "del": del_id})
                
                # SolvedProblems merge is harder due to unique(user_id, problem_id)
                # We'll just delete the duplicates if they exist for keep_id
                conn.execute(text("""
                    DELETE FROM solved_problems 
                    WHERE user_id = :del 
                    AND problem_id IN (SELECT problem_id FROM solved_problems WHERE user_id = :keep)
                """), {"keep": keep_id, "del": del_id})
                
                conn.execute(text("UPDATE solved_problems SET user_id = :keep WHERE user_id = :del"), {"keep": keep_id, "del": del_id})
                
                # Delete auxiliary data
                conn.execute(text("DELETE FROM user_stats WHERE user_id = :del"), {"del": del_id})
                conn.execute(text("DELETE FROM user_ratings WHERE user_id = :del"), {"del": del_id})
                conn.execute(text("DELETE FROM users WHERE id = :del"), {"del": del_id})
            
            print(f"  Email {email_lower} deduplicated.")
        
        # Finally, force a clean commit
        conn.execute(text("COMMIT;"))
        print("\n--- Deduplication Complete ---")

if __name__ == "__main__":
    dedupe()

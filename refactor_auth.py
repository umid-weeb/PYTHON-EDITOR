import os

file_path = 'backend/app/api/routes/auth.py'
with open(file_path, 'r', encoding='utf-8') as f:
    content = f.read()

# Locate the /me function
start_marker = 'def me(user: User = Depends(get_current_user), db: Session = Depends(get_db))'
end_marker = 'return MeResponse('

start_idx = content.find(start_marker)
end_idx = content.find(end_marker, start_idx)

if start_idx == -1 or end_idx == -1:
    print(f"Error: Could not find markers in {file_path}")
    sys.exit(1)

# Move start_idx to the beginning of the body (after the function signature)
body_start = content.find(':', start_idx) + 1
# Find the first newline after the colon to keep formatting
body_start = content.find('\n', body_start) + 1

new_body = """    try:
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

    """

new_content = content[:body_start] + new_body + content[end_idx:]

with open(file_path, 'w', encoding='utf-8') as f:
    f.write(new_content)

print("Successfully refactored /me endpoint")

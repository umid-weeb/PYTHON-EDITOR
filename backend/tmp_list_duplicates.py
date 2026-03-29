from app.database import SessionLocal
from app.models.problem import Problem
from sqlalchemy import func

def list_duplicates():
    session = SessionLocal()
    try:
        # Find titles that appear more than once
        duplicates = session.query(
            Problem.title, 
            func.count(Problem.id).label('count')
        ).group_by(Problem.title).having(func.count(Problem.id) > 1).all()
        
        with open("duplicates_analysis.txt", "w", encoding="utf-8") as f:
            f.write(f"Found {len(duplicates)} duplicate titles\n")
            for title, count in duplicates:
                f.write(f"\nTitle: {title} ({count} occurrences)\n")
                problems = session.query(Problem).filter(Problem.title == title).order_by(Problem.created_at).all()
                for p in problems:
                    f.write(f"  ID: {p.id}, Slug: {p.slug}, Created: {p.created_at}, DescLen: {len(p.description) if p.description else 0}\n")
                
    finally:
        session.close()

if __name__ == "__main__":
    list_duplicates()

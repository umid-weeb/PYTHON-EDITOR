from app.database import SessionLocal
from app.models.problem import Problem, TestCase
from sqlalchemy import func

def analyze_duplicate_content():
    session = SessionLocal()
    try:
        # Focusing on "Qavslar muvozanati" as an example
        title = "Qavslar muvozanati"
        problems = session.query(Problem).filter(Problem.title == title).all()
        
        with open("content_analysis.txt", "w", encoding="utf-8") as f:
            f.write(f"Analyzing problems with title: {title}\n")
            for p in problems:
                f.write(f"\nID: {p.id}, Slug: {p.slug}\n")
                f.write(f"Description (first 100 chars): {p.description[:100]}...\n")
                test_cases = session.query(TestCase).filter(TestCase.problem_id == p.id).all()
                f.write(f"Number of test cases: {len(test_cases)}\n")
                for tc in test_cases[:2]: # Check first 2 test cases
                    f.write(f"  TC Input: {tc.input}, Expected: {tc.expected_output}\n")
                
    finally:
        session.close()

if __name__ == "__main__":
    analyze_duplicate_content()

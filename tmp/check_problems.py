import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv
load_dotenv("backend/.env")
engine = create_engine(os.getenv("DATABASE_URL"))
def check():
    with engine.connect() as conn:
        print("PROBLEM DUPES (ID):")
        q = "SELECT id, COUNT(*) FROM problems GROUP BY id HAVING COUNT(*) > 1"
        for r in conn.execute(text(q)):
            print(f"ID: {r[0]} | Count: {r[1]}")
            for row in conn.execute(text("SELECT slug, title FROM problems WHERE id = :i"), {"i": r[0]}):
                print(f"  Slug: {row[0]} | Title: {row[1]}")
if __name__ == "__main__":
    check()

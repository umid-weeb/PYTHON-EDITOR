import os
import sqlalchemy
from sqlalchemy import create_engine, text

# Supabase URL from .env
DB_URL = "postgresql://postgres.fnqqvmpoovczxavkqyem:ibroximjon1105@aws-1-ap-south-1.pooler.supabase.com:6543/postgres"

def main():
    engine = create_engine(DB_URL)
    with engine.connect() as conn:
        print("Checking problems...")
        # Check for problems with missing function_name or starter_code
        result = conn.execute(text("SELECT id, title, slug, function_name FROM problems")).fetchall()
        
        for row in result:
            pid, title, slug, func_name = row
            if not func_name:
                print(f"Fixing function_name for problem: {title}")
                conn.execute(text("UPDATE problems SET function_name = 'solve' WHERE id = :id"), {"id": pid})
            
        conn.commit()
    print("Audit complete.")

if __name__ == "__main__":
    main()

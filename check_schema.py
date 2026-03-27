import os
import sys

sys.path.append(os.path.abspath('backend'))

from sqlalchemy import create_engine, MetaData, Table
from dotenv import load_dotenv

load_dotenv('backend/.env')

from app.database import _sanitize_db_url
url = _sanitize_db_url(os.getenv('DATABASE_URL'))
engine = create_engine(url)
metadata = MetaData()
submissions = Table('submissions', metadata, autoload_with=engine)

with open('schema_out.txt', 'w') as f:
    for c in submissions.c:
        f.write(f"{c.name} {c.type} Nullable: {c.nullable} Default: {c.server_default}\n")

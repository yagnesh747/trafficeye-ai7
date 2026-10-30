import os
from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from backend.app.config import settings

# Configure SQLite/PostgreSQL engine
connect_args = {}
if settings.DATABASE_URL.startswith("sqlite"):
    connect_args = {"check_same_thread": False}

# Disable query echoing on Vercel or in production
echo_sql = settings.DEBUG and not bool(os.environ.get("VERCEL"))

engine = create_engine(
    settings.DATABASE_URL,
    connect_args=connect_args,
    echo=echo_sql
)

SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

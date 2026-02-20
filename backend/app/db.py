from sqlalchemy import create_engine
from sqlalchemy.orm import Session, declarative_base, sessionmaker

from app.config import get_settings

Base = declarative_base()

_engine = None
_SessionLocal = None


def init_db() -> None:
    global _engine, _SessionLocal
    settings = get_settings()
    _engine = create_engine(settings.database_url, pool_pre_ping=True, pool_size=5)
    _SessionLocal = sessionmaker(bind=_engine, autocommit=False, autoflush=False)
    Base.metadata.create_all(bind=_engine)


def get_db():
    if _SessionLocal is None:
        init_db()
    db: Session = _SessionLocal()
    try:
        yield db
    finally:
        db.close()

import logging
from sqlalchemy import text
from sqlalchemy.exc import OperationalError, ProgrammingError
from app.db import get_db

logger = logging.getLogger("opsvoice.migrations")

def run_migrations():
    """
    Simple hackathon migration runner.
    Checks for missing columns and adds them.
    """
    db_gen = get_db()
    db = next(db_gen)
    
    try:
        # Check if 'style' column exists in 'debate_sessions'
        try:
            db.execute(text("SELECT style FROM debate_sessions LIMIT 1"))
        except (OperationalError, ProgrammingError):
            logger.info("Migrating: Adding 'style' column to debate_sessions")
            db.rollback()
            db.execute(text("ALTER TABLE debate_sessions ADD COLUMN style VARCHAR DEFAULT 'standard'"))
            db.commit()
            logger.info("Migration complete: Added 'style' column")
            
    except Exception as e:
        logger.error(f"Migration failed: {e}")
    finally:
        db.close()

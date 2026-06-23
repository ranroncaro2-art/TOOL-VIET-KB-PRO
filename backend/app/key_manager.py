from sqlalchemy.orm import Session
from datetime import datetime, timedelta
import random
from typing import Optional, List
from app.models import ApiKey
from app.config import settings

class KeyManager:
    @staticmethod
    def get_all_active_keys(db: Session) -> List[ApiKey]:
        """Fetch all keys that are active and not in cooldown."""
        now = datetime.utcnow()
        # Reset keys whose cooldown has expired
        expired_cooldown_keys = db.query(ApiKey).filter(
            ApiKey.status == "cooldown",
            ApiKey.cooldown_until <= now
        ).all()
        for key in expired_cooldown_keys:
            key.status = "active"
            key.cooldown_until = None
        db.commit()

        return db.query(ApiKey).filter(ApiKey.status == "active").all()

    @staticmethod
    def get_writer_key(db: Session, current_key_value: Optional[str] = None, force_failover: bool = False) -> str:
        """
        Get a stable key for the Writer Lane.
        If current_key_value is provided and not in cooldown, keep using it to maximize context caching.
        Otherwise, select a new active key.
        """
        # If we have a system key configured and we are in Paid Mode (or no user keys exist)
        active_keys = KeyManager.get_all_active_keys(db)
        
        # Fallback to system key if no user keys are available
        if not active_keys:
            if settings.GEMINI_API_KEY:
                return settings.GEMINI_API_KEY
            raise ValueError("No active Gemini API keys found. Please add a key in settings.")

        # Check if the current key is still active
        if current_key_value and not force_failover:
            db_key = db.query(ApiKey).filter(ApiKey.key_value == current_key_value, ApiKey.status == "active").first()
            if db_key:
                db_key.last_used = datetime.utcnow()
                db.commit()
                return db_key.key_value

        # Select a new key
        # We can pick the one that has been used the least recently to balance usage
        db_key = min(active_keys, key=lambda k: k.last_used or datetime.min)
        db_key.last_used = datetime.utcnow()
        db.commit()
        return db_key.key_value

    @staticmethod
    def get_utility_key(db: Session, exclude_key_value: Optional[str] = None) -> str:
        """
        Utility Lane: Round-robin/random choice over all active keys to distribute load,
        optionally excluding a specific key (e.g. the one used in Writer Lane if we want to separate them).
        """
        active_keys = KeyManager.get_all_active_keys(db)
        if not active_keys:
            if settings.GEMINI_API_KEY:
                return settings.GEMINI_API_KEY
            raise ValueError("No active Gemini API keys found. Please add a key in settings.")

        # Filter out exclude key if possible (to avoid taking the Writer key)
        eligible_keys = [k for k in active_keys if k.key_value != exclude_key_value]
        if not eligible_keys:
            eligible_keys = active_keys

        # Pick the key that was least recently used (Round-robin approximation)
        db_key = min(eligible_keys, key=lambda k: k.last_used or datetime.min)
        db_key.last_used = datetime.utcnow()
        db.commit()
        return db_key.key_value

    @staticmethod
    def mark_key_cooldown(db: Session, key_value: str, cooldown_minutes: int = 5):
        """Put a key into cooldown after hitting rate limits or quota exceeded errors."""
        if key_value == settings.GEMINI_API_KEY:
            # We don't cooldown the system key, just log it
            return
            
        db_key = db.query(ApiKey).filter(ApiKey.key_value == key_value).first()
        if db_key:
            db_key.status = "cooldown"
            db_key.cooldown_until = datetime.utcnow() + timedelta(minutes=cooldown_minutes)
            db_key.error_count += 1
            db_key.quota_errors += 1
            db.commit()

    @staticmethod
    def mark_key_success(db: Session, key_value: str):
        """Reset key error metrics on a successful API request."""
        db_key = db.query(ApiKey).filter(ApiKey.key_value == key_value).first()
        if db_key:
            db_key.error_count = max(0, db_key.error_count - 1)
            db.commit()
            
    @staticmethod
    def register_key(db: Session, key_value: str) -> ApiKey:
        """Register a new user API key."""
        existing = db.query(ApiKey).filter(ApiKey.key_value == key_value).first()
        if existing:
            existing.status = "active"
            existing.cooldown_until = None
            db.commit()
            return existing
        
        new_key = ApiKey(key_value=key_value)
        db.add(new_key)
        db.commit()
        db.refresh(new_key)
        return new_key

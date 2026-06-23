import os
from pydantic_settings import BaseSettings, SettingsConfigDict
from pydantic import Field

class Settings(BaseSettings):
    PROJECT_NAME: str = "Novel Writer V3 API"
    DEBUG: bool = True
    
    # Database
    DATABASE_URL: str = Field(default="sqlite:///./novel_writer.db")
    
    # Redis for Caching / Rate Limiting (optional fallback to memory)
    REDIS_URL: str = Field(default="")
    
    # Storage Config (S3/MinIO) - Fallback to local storage if empty
    S3_ENDPOINT: str = Field(default="")
    S3_ACCESS_KEY: str = Field(default="")
    S3_SECRET_KEY: str = Field(default="")
    S3_BUCKET_NAME: str = Field(default="novel-writer-v3")
    LOCAL_STORAGE_DIR: str = Field(default="./storage")
    
    # System Gemini Key for Paid Mode
    GEMINI_API_KEY: str = Field(default="")
    
    # Default model assignments
    MODEL_PRO: str = "gemini-2.5-pro"
    MODEL_FLASH: str = "gemini-2.5-flash"
    
    # Token Budget Constraints
    BUDGET_STYLE_RULES: int = 500
    BUDGET_SELECTED_CHARACTERS: int = 1000
    BUDGET_SELECTED_WORLD_RULES: int = 800
    BUDGET_CURRENT_ARC: int = 500
    BUDGET_LONG_TERM_FACTS: int = 300
    BUDGET_OPEN_THREADS: int = 300
    BUDGET_RETRIEVED_EVENTS: int = 1000
    BUDGET_OUTLINE: int = 1000
    BUDGET_MAX_INPUT_TOKENS: int = 6000
    
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

settings = Settings()

# Ensure local storage path exists
if not settings.S3_ENDPOINT:
    os.makedirs(settings.LOCAL_STORAGE_DIR, exist_ok=True)

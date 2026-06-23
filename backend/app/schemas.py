from pydantic import BaseModel, Field
from typing import List, Optional, Dict, Any
from datetime import datetime

# API Key
class ApiKeyCreate(BaseModel):
    key_value: str

class ApiKeyResponse(BaseModel):
    id: int
    key_value: str
    status: str
    cooldown_until: Optional[datetime] = None
    error_count: int
    quota_errors: int
    last_used: Optional[datetime] = None
    created_at: datetime

    class Config:
        from_attributes = True

# Story
class StoryCreate(BaseModel):
    title: str
    description: Optional[str] = None
    language: str = "vi"  # vi, ja, en
    pov: str = "third_person"
    style: str = "realistic"
    target_length: int = 2000

class StoryUpdate(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None
    language: Optional[str] = None
    pov: Optional[str] = None
    style: Optional[str] = None
    target_length: Optional[int] = None

class StoryResponse(BaseModel):
    id: int
    title: str
    description: Optional[str] = None
    status: str
    language: str
    pov: str
    style: str
    target_length: int
    created_at: datetime
    written_chapters_count: int = 0
    total_chapters_count: int = 0

    class Config:
        from_attributes = True

# Bibles
class StyleBibleResponse(BaseModel):
    id: int
    story_id: int
    version: int
    content: str
    updated_at: datetime

    class Config:
        from_attributes = True

class WorldBibleResponse(BaseModel):
    id: int
    story_id: int
    version: int
    content: str
    updated_at: datetime

    class Config:
        from_attributes = True

# Characters
class CharacterCreate(BaseModel):
    name: str
    profile_json: Optional[Dict[str, Any]] = None
    appearance: Optional[str] = None
    personality: Optional[str] = None
    speaking_style: Optional[str] = None
    secret: Optional[str] = None

class CharacterResponse(BaseModel):
    id: int
    story_id: int
    name: str
    profile_json: str
    appearance: Optional[str] = None
    personality: Optional[str] = None
    speaking_style: Optional[str] = None
    secret: Optional[str] = None
    version: int

    class Config:
        from_attributes = True

# Arcs
class ArcCreate(BaseModel):
    arc_no: int
    name: str
    goal: Optional[str] = None

class ArcResponse(BaseModel):
    id: int
    story_id: int
    arc_no: int
    name: str
    goal: Optional[str] = None
    summary: Optional[str] = None
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Plot Threads
class PlotThreadCreate(BaseModel):
    description: str
    arc_id: Optional[int] = None

class PlotThreadResponse(BaseModel):
    id: int
    story_id: int
    arc_id: Optional[int] = None
    description: str
    status: str
    created_at: datetime

    class Config:
        from_attributes = True

# Chapters
class ChapterCreate(BaseModel):
    arc_id: int
    chapter_no: int
    title: str
    outline: Optional[str] = None

class ChapterResponse(BaseModel):
    id: int
    story_id: int
    arc_id: int
    chapter_no: int
    title: str
    content: Optional[str] = None
    scene_plan: Optional[str] = None
    target_length: Optional[int] = 2000
    created_at: datetime

    class Config:
        from_attributes = True

# Prompts
class PromptCreate(BaseModel):
    name: str
    language: str
    category: str = "Style"
    is_cacheable: bool = False
    priority: int = 10
    content: str

class PromptPresetResponse(BaseModel):
    id: int
    name: str
    description: Optional[str] = None
    variables: Dict[str, Any]

    class Config:
        from_attributes = True

class PromptResponse(BaseModel):
    id: int
    name: str
    language: str
    category: str
    is_cacheable: bool
    priority: int
    content: str
    created_at: datetime

    class Config:
        from_attributes = True

# Generation Input
class GenerateChapterInput(BaseModel):
    chapter_no: int
    arc_id: int
    title: str
    outline: str
    selected_characters: List[str] = []
    selected_world_rules: List[str] = []
    api_key_mode: str = "free"  # free, paid

# System Settings
class SystemSettingResponse(BaseModel):
    key: str
    value: str
    description: Optional[str] = None

    class Config:
        from_attributes = True

class SystemSettingsBulkUpdate(BaseModel):
    settings: Dict[str, str]

# Usage Log
class UsageLogResponse(BaseModel):
    id: int
    story_id: int
    chapter_no: Optional[int] = None
    node_name: Optional[str] = None
    model_name: str
    input_tokens: int
    output_tokens: int
    cached_input_tokens: int
    estimated_cost: float
    timestamp: datetime

    class Config:
        from_attributes = True

class UsageSummaryResponse(BaseModel):
    total_cost: float
    total_input_tokens: int
    total_output_tokens: int
    total_cached_tokens: int
    caching_savings: float
    logs: List[UsageLogResponse]


# Story Details Response
class LongTermFactResponse(BaseModel):
    id: int
    story_id: int
    fact_text: str
    created_at: datetime

    class Config:
        from_attributes = True

class StoryDetailsResponse(BaseModel):
    story: StoryResponse
    style_bible: Optional[StyleBibleResponse] = None
    world_bible: Optional[WorldBibleResponse] = None
    characters: List[CharacterResponse] = []
    arcs: List[ArcResponse] = []
    plot_threads: List[PlotThreadResponse] = []
    chapters: List[ChapterResponse] = []
    long_term_facts: List[LongTermFactResponse] = []


# Import Outline Input
class ImportOutlineInput(BaseModel):
    arc_id: Optional[int] = None
    outline_text: str

# Start Auto Write Input
class StartAutoWriteInput(BaseModel):
    start_chapter_no: int
    end_chapter_no: int
    selected_characters: List[str] = []
    selected_world_rules: List[str] = []





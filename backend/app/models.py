from sqlalchemy import Column, Integer, String, Text, ForeignKey, DateTime, Boolean, Float
from sqlalchemy.orm import relationship
from datetime import datetime
from app.database import Base

class Story(Base):
    __tablename__ = "stories"
    
    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(255), nullable=False)
    description = Column(Text, nullable=True)
    status = Column(String(50), default="draft")  # draft, writing, completed
    language = Column(String(10), default="vi")  # vi, ja, en
    pov = Column(String(50), default="third_person")
    style = Column(String(100), default="realistic")
    target_length = Column(Integer, default=2000)  # chapter target word length
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relationships
    style_bibles = relationship("StyleBible", back_populates="story", cascade="all, delete-orphan")
    world_bibles = relationship("WorldBible", back_populates="story", cascade="all, delete-orphan")
    characters = relationship("Character", back_populates="story", cascade="all, delete-orphan")
    arcs = relationship("Arc", back_populates="story", cascade="all, delete-orphan")
    plot_threads = relationship("PlotThread", back_populates="story", cascade="all, delete-orphan")
    chapters = relationship("Chapter", back_populates="story", cascade="all, delete-orphan")
    events = relationship("Event", back_populates="story", cascade="all, delete-orphan")
    long_term_facts = relationship("LongTermFact", back_populates="story", cascade="all, delete-orphan")
    usage_logs = relationship("UsageLog", back_populates="story", cascade="all, delete-orphan")

    @property
    def written_chapters_count(self) -> int:
        return len([c for c in self.chapters if c.content and c.content.strip()])

    @property
    def total_chapters_count(self) -> int:
        return len(self.chapters)


class StyleBible(Base):
    __tablename__ = "style_bibles"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    version = Column(Integer, default=1)
    content = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    story = relationship("Story", back_populates="style_bibles")

class WorldBible(Base):
    __tablename__ = "world_bibles"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    version = Column(Integer, default=1)
    content = Column(Text, nullable=False)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    story = relationship("Story", back_populates="world_bibles")

class Character(Base):
    __tablename__ = "characters"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    name = Column(String(100), nullable=False)
    profile_json = Column(Text, default="{}")  # stores standard metadata
    appearance = Column(Text, nullable=True)
    personality = Column(Text, nullable=True)
    speaking_style = Column(Text, nullable=True)
    secret = Column(Text, nullable=True)
    version = Column(Integer, default=1)
    
    story = relationship("Story", back_populates="characters")
    deltas = relationship("CharacterDelta", back_populates="character", cascade="all, delete-orphan")

class CharacterDelta(Base):
    __tablename__ = "character_deltas"
    
    id = Column(Integer, primary_key=True, index=True)
    character_id = Column(Integer, ForeignKey("characters.id"), nullable=False)
    chapter_no = Column(Integer, nullable=False)
    change_description = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    character = relationship("Character", back_populates="deltas")

class Arc(Base):
    __tablename__ = "arcs"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    arc_no = Column(Integer, nullable=False)
    name = Column(String(255), nullable=False)
    goal = Column(Text, nullable=True)
    summary = Column(Text, nullable=True)  # Arc Recap summary, 500-1000 tokens
    status = Column(String(50), default="active")  # active, completed
    created_at = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="arcs")
    chapters = relationship("Chapter", back_populates="arc", cascade="all, delete-orphan")

class PlotThread(Base):
    __tablename__ = "plot_threads"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    arc_id = Column(Integer, ForeignKey("arcs.id"), nullable=True)
    description = Column(Text, nullable=False)
    status = Column(String(50), default="open")  # open, closed
    created_at = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="plot_threads")

class Chapter(Base):
    __tablename__ = "chapters"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    arc_id = Column(Integer, ForeignKey("arcs.id"), nullable=False)
    chapter_no = Column(Integer, nullable=False)
    title = Column(String(255), nullable=False)
    content = Column(Text, nullable=True)
    scene_plan = Column(Text, nullable=True)  # scene descriptions and structure
    target_length = Column(Integer, default=2000, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="chapters")
    arc = relationship("Arc", back_populates="chapters")

class Event(Base):
    __tablename__ = "events"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    chapter_no = Column(Integer, nullable=False)
    event_text = Column(Text, nullable=False)
    characters = Column(Text, nullable=True)  # comma separated names
    locations = Column(Text, nullable=True)   # comma separated locations
    objects = Column(Text, nullable=True)     # comma separated objects
    embedding = Column(Text, nullable=True)    # JSON stringified float array
    is_archived = Column(Boolean, default=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="events")

class LongTermFact(Base):
    __tablename__ = "long_term_facts"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False)
    fact_text = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="long_term_facts")

class Prompt(Base):
    __tablename__ = "prompts"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    language = Column(String(10), nullable=False)  # vi, ja, en
    category = Column(String(50), default="Style")  # System, Format, Style, Outline Expansion, Character Memory, Summary Generator
    is_cacheable = Column(Boolean, default=False)
    priority = Column(Integer, default=10)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    versions = relationship("PromptVersion", back_populates="prompt", cascade="all, delete-orphan")

class PromptVersion(Base):
    __tablename__ = "prompt_versions"
    
    id = Column(Integer, primary_key=True, index=True)
    prompt_id = Column(Integer, ForeignKey("prompts.id"), nullable=False)
    version = Column(Integer, nullable=False)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow)
    
    prompt = relationship("Prompt", back_populates="versions")

class PromptPreset(Base):
    __tablename__ = "prompt_presets"
    
    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)
    description = Column(Text, nullable=True)
    variables = Column(Text, default="{}")  # JSON stringified preset variables

class ApiKey(Base):
    __tablename__ = "api_keys"
    
    id = Column(Integer, primary_key=True, index=True)
    key_value = Column(String(255), unique=True, nullable=False)
    status = Column(String(50), default="active")  # active, cooldown, inactive
    cooldown_until = Column(DateTime, nullable=True)
    error_count = Column(Integer, default=0)
    quota_errors = Column(Integer, default=0)
    last_used = Column(DateTime, nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow)

class SystemSetting(Base):
    __tablename__ = "system_settings"
    
    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), unique=True, nullable=False)
    value = Column(Text, nullable=False)
    description = Column(Text, nullable=True)

    @classmethod
    def get_val(cls, db, key, default=None):
        try:
            res = db.query(cls).filter(cls.key == key).first()
            if res:
                return res.value
        except Exception:
            pass
        return default

    @classmethod
    def get_active_models(cls, db):
        workflow_mode = cls.get_val(db, "workflow_mode", "hybrid")
        flash_model = cls.get_val(db, "model_flash", "gemini-2.5-flash")
        if workflow_mode == "flash_only":
            return flash_model, flash_model
        pro_model = cls.get_val(db, "model_pro", "gemini-2.5-pro")
        return pro_model, flash_model

class UsageLog(Base):
    __tablename__ = "usage_logs"
    
    id = Column(Integer, primary_key=True, index=True)
    story_id = Column(Integer, ForeignKey("stories.id"), nullable=False, index=True)
    chapter_no = Column(Integer, nullable=True)
    node_name = Column(String(100), nullable=True)
    model_name = Column(String(100), nullable=False)
    input_tokens = Column(Integer, default=0)
    output_tokens = Column(Integer, default=0)
    cached_input_tokens = Column(Integer, default=0)
    estimated_cost = Column(Float, default=0.0)
    timestamp = Column(DateTime, default=datetime.utcnow)
    
    story = relationship("Story", back_populates="usage_logs")


import json
import math
import re
from typing import List, Dict, Any, Optional
from sqlalchemy.orm import Session
from app.models import Event, Character
from app.services.gemini_service import GeminiService
from app.config import settings

def cosine_similarity(v1: List[float], v2: List[float]) -> float:
    """Compute cosine similarity between two vector lists."""
    if not v1 or not v2 or len(v1) != len(v2):
        return 0.0
    dot_product = sum(a * b for a, b in zip(v1, v2))
    magnitude_v1 = math.sqrt(sum(a * a for a in v1))
    magnitude_v2 = math.sqrt(sum(b * b for b in v2))
    if magnitude_v1 == 0.0 or magnitude_v2 == 0.0:
        return 0.0
    return dot_product / (magnitude_v1 * magnitude_v2)

class RetrievalService:
    @staticmethod
    def extract_search_entities(api_key: str, outline: str, db: Optional[Session] = None) -> Dict[str, List[str]]:
        """
        Use Gemini Flash to parse entities (characters, locations, objects)
        from the current outline to guide the retrieval.
        """
        system_instruction = (
            "You are an NLP extractor. Extract key entities that are explicitly mentioned in the story outline.\n"
            "Output ONLY a raw JSON with keys: 'characters', 'locations', 'objects' (all lists of strings).\n"
            "Example: { \"characters\": [\"Ren\", \"Yuki\"], \"locations\": [\"Gym Storage\"], \"objects\": [\"Knife\"] }"
        )
        
        from app.models import SystemSetting
        if db:
            _, flash_model = SystemSetting.get_active_models(db)
        else:
            flash_model = settings.MODEL_FLASH
            
        try:
            res = GeminiService.generate(
                api_key=api_key,
                model=flash_model,
                prompt=f"Outline:\n{outline}",
                system_instruction=system_instruction,
                json_mode=True
            )
            match = re.search(r"\{.*\}", res, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                return {
                    "characters": data.get("characters", []),
                    "locations": data.get("locations", []),
                    "objects": data.get("objects", [])
                }
        except Exception:
            pass
            
        return {"characters": [], "locations": [], "objects": []}

    @classmethod
    def retrieve_relevant_events(
        cls,
        db: Session,
        story_id: int,
        api_key: str,
        outline: str,
        top_k: int = 5
    ) -> List[Event]:
        """
        Retrieval Strategy:
        Step 1 & 2: Entity & Metadata Extract/Filter
        Step 3: Semantic Vector Search
        Step 4: Top K Sort & Select
        """
        # Step 1: Extract entities from the outline
        entities = cls.extract_search_entities(api_key, outline, db=db)
        search_chars = [c.lower() for c in entities.get("characters", [])]
        search_locs = [l.lower() for l in entities.get("locations", [])]
        search_objs = [o.lower() for o in entities.get("objects", [])]
        
        # Step 2: Retrieve all unarchived events for this story
        events = db.query(Event).filter(
            Event.story_id == story_id,
            Event.is_archived == False
        ).all()
        
        if not events:
            return []
            
        # Get semantic embedding of the search outline
        try:
            outline_embedding = GeminiService.get_embedding(api_key, outline)
        except Exception:
            outline_embedding = None
            
        scored_events = []
        for event in events:
            # Metadata scoring: check intersections
            entity_score = 0.0
            
            # Helper to parse string list / comma-separated text
            def parse_meta(val: Optional[str]) -> List[str]:
                if not val:
                    return []
                # Check if JSON
                if val.startswith("["):
                    try:
                        return [x.lower() for x in json.loads(val)]
                    except Exception:
                        pass
                return [x.strip().lower() for x in val.split(",") if x.strip()]
                
            event_chars = parse_meta(event.characters)
            event_locs = parse_meta(event.locations)
            event_objs = parse_meta(event.objects)
            
            # Count overlaps
            char_matches = sum(1 for c in search_chars if c in event_chars)
            loc_matches = sum(1 for l in search_locs if l in event_locs)
            obj_matches = sum(1 for o in search_objs if o in event_objs)
            
            # Boost score based on overlaps
            entity_score += char_matches * 0.15
            entity_score += loc_matches * 0.10
            entity_score += obj_matches * 0.05
            
            # Step 3: Semantic similarity
            semantic_score = 0.0
            if outline_embedding and event.embedding:
                try:
                    event_embedding = json.loads(event.embedding)
                    semantic_score = cosine_similarity(outline_embedding, event_embedding)
                except Exception:
                    pass
            
            # Final combined score
            # Vector similarity represents the baseline semantic alignment,
            # boosted by metadata matches.
            final_score = semantic_score + entity_score
            scored_events.append((final_score, event))
            
        # Step 4: Sort and return Top K
        scored_events.sort(key=lambda x: x[0], reverse=True)
        
        # Keep only the event objects
        result_events = [item[1] for item in scored_events[:top_k]]
        return result_events

import json
import re
from typing import List, Dict, Any
from sqlalchemy.orm import Session
from app.models import Story, Arc, Chapter, Character, CharacterDelta, PlotThread, Event, LongTermFact, SystemSetting
from app.services.gemini_service import GeminiService
from app.key_manager import KeyManager
from app.config import settings

class MemoryGraph:
    @classmethod
    def execute_memory_builder(cls, db: Session, story_id: int, arc_id: int, chapter_no: int, chapter_content: str, key: str, logs: List[str]):
        logs.append("Running Memory Builder (Flash)...")
        
        # Load facts
        facts = db.query(LongTermFact).filter(LongTermFact.story_id == story_id).all()
        facts_text = "\n".join([f"- {f.fact_text}" for f in facts])
        
        # Load threads
        threads = db.query(PlotThread).filter(PlotThread.story_id == story_id).all()
        threads_text = "\n".join([f"- {t.description} (status: {t.status})" for t in threads])
        
        # Load active arc
        arc = db.query(Arc).filter(Arc.id == arc_id).first()
        arc_summary = arc.summary or "No summary yet."
        
        system_instruction = (
            "You are a story database manager. Your task is to analyze the new chapter and update the story memory.\n"
            "CRITICAL CONSOLIDATION RULE:\n"
            "You must aggressively merge, consolidate, and deduplicate long-term facts. "
            "Never create redundant or minor overlapping facts for the same character, location, or event.\n"
            "If a new fact updates or adds details to an existing fact, mark the old fact as obsolete by putting its exact text "
            "in 'obsolete_facts' and output the merged/updated consolidated fact in 'new_facts'. Keep the facts list compact and high-level.\n\n"
            "Produce ONLY a raw JSON with the following schema:\n"
            "{\n"
            "  \"new_facts\": [\"new important permanent facts to add (always merged and consolidated with existing facts if overlapping)\"],\n"
            "  \"obsolete_facts\": [\"exact string of existing facts that are now outdated, resolved, or being replaced/merged\"],\n"
            "  \"updated_threads\": [\n"
            "     { \"description\": \"thread description\", \"status\": \"open\" | \"closed\", \"is_new\": true | false }\n"
            "  ],\n"
            "  \"updated_arc_recap\": \"a fresh recap summary of the current arc incorporating this chapter (max 1000 tokens)\"\n"
            "}"
        )
        
        prompt = (
            f"Current Arc Recap:\n{arc_summary}\n\n"
            f"Existing Long Term Facts:\n{facts_text}\n\n"
            f"Existing Plot Threads:\n{threads_text}\n\n"
            f"New Chapter Content:\n{chapter_content[:15000]}"
        )
        
        _, flash_model = SystemSetting.get_active_models(db)
        try:
            res = GeminiService.generate(
                api_key=key,
                model=flash_model,
                prompt=prompt,
                system_instruction=system_instruction,
                json_mode=True,
                temperature=0.3,
                db=db,
                story_id=story_id,
                chapter_no=chapter_no,
                node_name="Memory Builder"
            )
            match = re.search(r"\{.*\}", res, re.DOTALL)
            if match:
                data = json.loads(match.group(0))
                
                # 1. Update facts
                # Add new facts
                for fact_str in data.get("new_facts", []):
                    if fact_str.strip():
                        # Avoid duplicates
                        exists = db.query(LongTermFact).filter(
                            LongTermFact.story_id == story_id,
                            LongTermFact.fact_text == fact_str
                        ).first()
                        if not exists:
                            db.add(LongTermFact(story_id=story_id, fact_text=fact_str))
                # Delete obsolete facts
                for obsolete in data.get("obsolete_facts", []):
                    db.query(LongTermFact).filter(
                        LongTermFact.story_id == story_id,
                        LongTermFact.fact_text == obsolete
                    ).delete()
                
                # 2. Update threads
                for ut in data.get("updated_threads", []):
                    desc = ut.get("description")
                    status = ut.get("status", "open")
                    is_new = ut.get("is_new", False)
                    
                    if is_new:
                        # Add new thread
                        new_t = PlotThread(story_id=story_id, arc_id=arc_id, description=desc, status=status)
                        db.add(new_t)
                    else:
                        # Find existing thread
                        existing_t = db.query(PlotThread).filter(
                            PlotThread.story_id == story_id,
                            PlotThread.description == desc
                        ).first()
                        if existing_t:
                            existing_t.status = status
                
                # 3. Update Arc summary
                recap = data.get("updated_arc_recap")
                if recap:
                    arc.summary = recap
                    
                db.commit()
                logs.append("Memory Builder: Facts, threads, and arc recap updated successfully.")
        except Exception as e:
            logs.append(f"Memory Builder error: {str(e)}")

    @classmethod
    def execute_event_extractor(cls, db: Session, story_id: int, chapter_no: int, chapter_content: str, key: str, logs: List[str]):
        logs.append("Running Event Extractor & Entity Graph (Flash)...")
        
        system_instruction = (
            "You are a story analyst. Extract 1 to 5 key plot events that occurred in this chapter draft. "
            "For each event, isolate the characters, locations, and objects involved to map the Entity Graph.\n"
            "Output ONLY a raw JSON array containing objects matching this schema:\n"
            "[\n"
            "  {\n"
            "    \"event_text\": \"Ren hides the knife in gym storage.\",\n"
            "    \"characters\": [\"Ren\"],\n"
            "    \"locations\": [\"Gym Storage\"],\n"
            "    \"objects\": [\"Knife\"]\n"
            "  }\n"
            "]"
        )
        
        _, flash_model = SystemSetting.get_active_models(db)
        try:
            res = GeminiService.generate(
                api_key=key,
                model=flash_model,
                prompt=f"Chapter Draft:\n{chapter_content[:15000]}",
                system_instruction=system_instruction,
                json_mode=True,
                temperature=0.3,
                db=db,
                story_id=story_id,
                chapter_no=chapter_no,
                node_name="Event Extractor"
            )
            
            match = re.search(r"\[.*\]", res, re.DOTALL)
            if match:
                events = json.loads(match.group(0))
                for ev in events:
                    text = ev.get("event_text")
                    chars = ev.get("characters", [])
                    locs = ev.get("locations", [])
                    objs = ev.get("objects", [])
                    
                    if not text:
                        continue
                        
                    # Calculate vector embedding for this event
                    embedding_vector = None
                    try:
                        embedding_vector = GeminiService.get_embedding(key, text)
                    except Exception as emb_err:
                        logs.append(f"Failed to generate embedding for event '{text[:20]}...': {str(emb_err)}")
                    
                    # Create DB event record
                    db_event = Event(
                        story_id=story_id,
                        chapter_no=chapter_no,
                        event_text=text,
                        characters=",".join(chars),
                        locations=",".join(locs),
                        objects=",".join(objs),
                        embedding=json.dumps(embedding_vector) if embedding_vector else None
                    )
                    db.add(db_event)
                
                db.commit()
                logs.append(f"Event Extractor: Saved {len(events)} new events into vector memory.")
        except Exception as e:
            logs.append(f"Event Extractor error: {str(e)}")

    @classmethod
    def execute_character_delta_detector(cls, db: Session, story_id: int, chapter_no: int, chapter_content: str, key: str, logs: List[str]):
        logs.append("Running Character Delta Detector (Flash)...")
        
        # Load characters
        chars = db.query(Character).filter(Character.story_id == story_id).all()
        if not chars:
            return
            
        char_list = [f"- {c.name}: {c.personality}" for c in chars]
        
        system_instruction = (
            "You are a character psychologist. Detect if any character's mindset, relationships, or secrets "
            "underwent significant changes in this chapter.\n"
            "Output ONLY a raw JSON array of delta objects:\n"
            "[\n"
            "  {\n"
            "    \"character_name\": \"Ren\",\n"
            "    \"change_description\": \"Ren begins to trust Yuki after she keeps his secret.\"\n"
            "  }\n"
            "]"
        )
        
        prompt = (
            f"Characters list:\n" + "\n".join(char_list) + "\n\n"
            f"Chapter Content:\n{chapter_content[:15000]}"
        )
        
        _, flash_model = SystemSetting.get_active_models(db)
        try:
            res = GeminiService.generate(
                api_key=key,
                model=flash_model,
                prompt=prompt,
                system_instruction=system_instruction,
                json_mode=True,
                temperature=0.3,
                db=db,
                story_id=story_id,
                chapter_no=chapter_no,
                node_name="Character Delta Detector"
            )
            
            match = re.search(r"\[.*\]", res, re.DOTALL)
            if match:
                deltas = json.loads(match.group(0))
                for delta in deltas:
                    name = delta.get("character_name")
                    desc = delta.get("change_description")
                    
                    if not name or not desc:
                        continue
                        
                    # Find character in DB
                    db_char = db.query(Character).filter(
                        Character.story_id == story_id,
                        Character.name == name
                    ).first()
                    
                    if db_char:
                        # Log delta
                        new_delta = CharacterDelta(
                            character_id=db_char.id,
                            chapter_no=chapter_no,
                            change_description=desc
                        )
                        db.add(new_delta)
                        
                        # Increment character version
                        db_char.version += 1
                
                db.commit()
                logs.append(f"Character Delta Detector: Logged {len(deltas)} updates.")
        except Exception as e:
            logs.append(f"Character Delta Detector error: {str(e)}")

    @classmethod
    def run_all(cls, db: Session, story_id: int, arc_id: int, chapter_no: int, chapter_content: str, logs: List[str]):
        """Executes the full memory compilation workflow."""
        try:
            key = KeyManager.get_utility_key(db)
        except Exception:
            # Fallback
            key = settings.GEMINI_API_KEY
            
        if not key:
            logs.append("Skipping Memory compilation: No API keys configured.")
            return

        cls.execute_memory_builder(db, story_id, arc_id, chapter_no, chapter_content, key, logs)
        cls.execute_event_extractor(db, story_id, chapter_no, chapter_content, key, logs)
        cls.execute_character_delta_detector(db, story_id, chapter_no, chapter_content, key, logs)

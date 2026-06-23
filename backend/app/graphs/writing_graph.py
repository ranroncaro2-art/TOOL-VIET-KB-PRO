from typing import List, Dict, Any, Optional
import json
import re
from pydantic import BaseModel
from sqlalchemy.orm import Session
from app.models import Story, Arc, Chapter, Character, WorldBible, StyleBible, PlotThread, LongTermFact
from app.services.gemini_service import GeminiService, GeminiRateLimitError, GeminiAPIError
from app.key_manager import KeyManager
from app.services.retrieval_service import RetrievalService
from app.config import settings
import app.models as models

class WritingState(BaseModel):
    story_id: int
    chapter_no: int
    arc_id: int
    outline: str
    selected_characters: List[str] = []
    selected_world_rules: List[str] = []
    current_arc_memory: str = ""
    long_term_facts: List[str] = []
    open_threads: List[str] = []
    retrieved_events: List[str] = []
    scene_plan: List[Dict[str, Any]] = []
    scene_drafts: List[str] = []
    chapter_draft: str = ""
    validation_result: Dict[str, Any] = {}
    retry_count: int = 0
    current_api_key: str = ""
    cache_ids: List[str] = []
    logs: List[str] = []

class WritingGraph:
    @classmethod
    def execute_node_with_retry(cls, db: Session, state: WritingState, node_func, *args, **kwargs) -> Any:
        """
        Executes a node function and automatically handles Gemini 429 failover.
        """
        max_retries = 3
        attempt = 0
        while attempt < max_retries:
            try:
                # Ensure we have a key
                if not state.current_api_key:
                    state.current_api_key = KeyManager.get_writer_key(db)
                
                return node_func(db, state, *args, **kwargs)
            except (GeminiRateLimitError, GeminiAPIError) as e:
                status_code = getattr(e, "status_code", 429)
                # If it's a non-transient GeminiAPIError, raise it immediately
                if isinstance(e, GeminiAPIError) and status_code not in [429, 500, 502, 503, 504]:
                    state.logs.append(f"Non-transient API Error: {str(e)}")
                    raise e
                    
                attempt += 1
                state.logs.append(f"Transient error ({status_code}) hit with key ...{state.current_api_key[-6:]}. Failing over...")
                # Cool down the failing key
                KeyManager.mark_key_cooldown(db, state.current_api_key)
                # Select a new key
                state.current_api_key = KeyManager.get_writer_key(db, force_failover=True)
            except Exception as e:
                state.logs.append(f"Error in graph execution node: {str(e)}")
                raise e
        raise RuntimeError("WritingGraph failed: Max key failover retries exceeded.")

    @classmethod
    def build_context_node(cls, db: Session, state: WritingState):
        state.logs.append("Node: Build Context started.")
        
        # Load Story
        story = db.query(Story).filter(Story.id == state.story_id).first()
        if not story:
            raise ValueError(f"Story {state.story_id} not found.")

        # Bind stable key to writer lane if not set
        if not state.current_api_key:
            state.current_api_key = KeyManager.get_writer_key(db)

        # 1. Retrieve events of the 3 most recent chapters to maintain continuous context flow
        import app.models as models
        recent_evs = db.query(models.Event).filter(
            models.Event.story_id == state.story_id,
            models.Event.chapter_no >= max(1, state.chapter_no - 3),
            models.Event.chapter_no < state.chapter_no,
            models.Event.is_archived == False
        ).all()
        
        # 2. Retrieve entity-matched semantic events
        retrieved_evs = RetrievalService.retrieve_relevant_events(
            db, state.story_id, state.current_api_key, state.outline, top_k=3
        )
        
        # Merge recent events and retrieved events, eliminating duplicates
        merged_evs = {e.id: e for e in (recent_evs + retrieved_evs)}.values()
        sorted_evs = sorted(merged_evs, key=lambda e: e.chapter_no)
        
        state.retrieved_events = [e.event_text for e in sorted_evs]
        state.logs.append(f"Retrieved memory events: {len(recent_evs)} recent chapters + {len(retrieved_evs)} semantic matching events.")

        # 3. Load open plot threads
        threads = db.query(models.PlotThread).filter(
            models.PlotThread.story_id == state.story_id,
            models.PlotThread.status == "open"
        ).all()
        state.open_threads = [t.description for t in threads]

        # 4. Load Long Term Facts
        facts = db.query(models.LongTermFact).filter(models.LongTermFact.story_id == state.story_id).all()
        state.long_term_facts = [f.fact_text for f in facts]

        # 5. Load Current Arc Memory
        arc = db.query(models.Arc).filter(models.Arc.id == state.arc_id).first()
        state.current_arc_memory = arc.summary or ""

        # Make sure we don't exceed the token budget. We will truncate lists to stay within limits.
        state.long_term_facts = state.long_term_facts[:10]  # limit to top 10 facts
        state.open_threads = state.open_threads[:8]        # limit to top 8 open threads
        state.retrieved_events = state.retrieved_events[:5]  # limit to top 5 events total

        state.logs.append("Context assembled and pruned within token budget limits.")
        return state

    @classmethod
    def scene_planner_node(cls, db: Session, state: WritingState):
        state.logs.append("Node: Scene Planner started.")
        
        story = db.query(Story).filter(Story.id == state.story_id).first()
        import app.models as models
        
        # Fetch active characters
        char_details = []
        if state.selected_characters:
            chars = db.query(models.Character).filter(
                models.Character.story_id == state.story_id,
                models.Character.name.in_(state.selected_characters)
            ).all()
            for c in chars:
                c_deltas = db.query(models.CharacterDelta).filter(models.CharacterDelta.character_id == c.id).all()
                deltas_desc = ", ".join([cd.change_description for cd in c_deltas])
                delta_str = f"Mindset shifts: {deltas_desc}" if deltas_desc else ""
                char_details.append(
                    f"Character: {c.name}\n- Profile: {c.personality or ''}\n- Appearance: {c.appearance or ''}\n- Secret: {c.secret or ''}\n- {delta_str}"
                )

        # Assemble Memory Context
        memory_text = (
            "=== ACTIVE CAST DETAILS ===\n" + "\n".join(char_details) + "\n\n"
            f"=== ARC RECAP ===\n{state.current_arc_memory}\n\n"
            "=== LONG TERM FACTS ===\n" + "\n".join(state.long_term_facts) + "\n\n"
            "=== OPEN PLOT THREADS ===\n" + "\n".join(state.open_threads) + "\n\n"
            "=== RETRIEVED HISTORICAL EVENTS ===\n" + "\n".join(state.retrieved_events)
        )

        # Assemble Task details
        task_text = (
            f"Target Chapter: Chapter {state.chapter_no}\n"
            f"POV (Point of view): {story.pov}\n"
            f"Target Length: {story.target_length} characters\n"
            f"Chapter Title: {state.outline[:40]}..."
        )

        # Compile caching segments
        prefix_prompt, suffix_prompt = GeminiService.compile_prefix_and_suffix(
            db=db,
            language=story.language,
            memory_text=memory_text,
            task_text=task_text,
            outline_text=state.outline
        )
        
        final_prompt = suffix_prompt + "\n\n=== ACTION: GENERATE SCENE PLANS ===\n" + (
            "Review the outline, memory, and task settings. Generate 3 to 4 sequential, detailed scene plans.\n"
            "Output ONLY a raw JSON array containing scene objects. Do not include markdown code block formatting.\n"
            "Each scene object must contain: 'scene_no', 'title', 'characters_involved', 'objective', 'narrative_focus'."
        )

        pro_model, _ = models.SystemSetting.get_active_models(db)
        res = GeminiService.generate(
            api_key=state.current_api_key,
            model=pro_model, # Planner uses Pro
            prompt=final_prompt,
            system_instruction=prefix_prompt,
            json_mode=True,
            temperature=0.4,
            db=db,
            story_id=state.story_id,
            chapter_no=state.chapter_no,
            node_name="Scene Planner"
        )

        # Parse plan
        match = re.search(r"\[.*\]", res, re.DOTALL)
        if match:
            state.scene_plan = json.loads(match.group(0))
        else:
            # Fallback to single scene plan if JSON parse fails
            state.scene_plan = [{
                "scene_no": 1,
                "title": "Main Scene",
                "characters_involved": state.selected_characters,
                "objective": state.outline,
                "narrative_focus": "Write the full chapter details."
            }]

        state.logs.append(f"Scene plan generated: {len(state.scene_plan)} scenes outlined.")
        return state

    @classmethod
    def scene_writer_node(cls, db: Session, state: WritingState):
        state.logs.append("Node: Scene Writer started.")
        state.scene_drafts = []
        
        story = db.query(Story).filter(Story.id == state.story_id).first()
        import app.models as models

        # Fetch active characters
        char_details = []
        if state.selected_characters:
            chars = db.query(models.Character).filter(
                models.Character.story_id == state.story_id,
                models.Character.name.in_(state.selected_characters)
            ).all()
            for c in chars:
                c_deltas = db.query(models.CharacterDelta).filter(models.CharacterDelta.character_id == c.id).all()
                deltas_desc = ", ".join([cd.change_description for cd in c_deltas])
                delta_str = f"Mindset shifts: {deltas_desc}" if deltas_desc else ""
                char_details.append(
                    f"Character: {c.name}\n- Profile: {c.personality or ''}\n- Appearance: {c.appearance or ''}\n- Secret: {c.secret or ''}\n- {delta_str}"
                )

        # Assemble Memory Context (same as planner to maintain cache prefix alignment)
        memory_text = (
            "=== ACTIVE CAST DETAILS ===\n" + "\n".join(char_details) + "\n\n"
            f"=== ARC RECAP ===\n{state.current_arc_memory}\n\n"
            "=== LONG TERM FACTS ===\n" + "\n".join(state.long_term_facts) + "\n\n"
            "=== OPEN PLOT THREADS ===\n" + "\n".join(state.open_threads) + "\n\n"
            "=== RETRIEVED HISTORICAL EVENTS ===\n" + "\n".join(state.retrieved_events)
        )

        # Assemble Task details
        task_text = (
            f"Target Chapter: Chapter {state.chapter_no}\n"
            f"POV (Point of view): {story.pov}\n"
            f"Target Length: {story.target_length} characters\n"
            f"Chapter Title: {state.outline[:40]}..."
        )

        # Compile caching segments
        prefix_prompt, suffix_prompt = GeminiService.compile_prefix_and_suffix(
            db=db,
            language=story.language,
            memory_text=memory_text,
            task_text=task_text,
            outline_text=state.outline
        )

        for i, scene in enumerate(state.scene_plan):
            state.logs.append(f"Writing Scene {i+1}/{len(state.scene_plan)}: {scene.get('title')}")
            
            # Action directive for this specific scene
            scene_context = (
                f"\n\n=== ACTION: WRITE SCENE {scene.get('scene_no')} OF {len(state.scene_plan)} ===\n"
                f"Scene Title: {scene.get('title')}\n"
                f"Characters Involved: {', '.join(scene.get('characters_involved', []))}\n"
                f"Scene Objective: {scene.get('objective')}\n"
                f"Narrative Focus: {scene.get('narrative_focus')}\n"
            )
            
            history_context = ""
            if state.scene_drafts:
                history_context = "\nPreceding Scene Drafts:\n" + "\n\n".join(state.scene_drafts[-1:]) + "\n"

            final_prompt = suffix_prompt + scene_context + history_context + "\nWrite the complete dialogue and narrative for this scene now. Output ONLY the story content."

            pro_model, _ = models.SystemSetting.get_active_models(db)
            draft = GeminiService.generate(
                api_key=state.current_api_key,
                model=pro_model, # Writer uses Pro
                prompt=final_prompt,
                system_instruction=prefix_prompt,
                temperature=0.7,
                db=db,
                story_id=state.story_id,
                chapter_no=state.chapter_no,
                node_name=f"Scene Writer (Scene {i+1})"
            )
            
            state.scene_drafts.append(draft)
            
        state.logs.append("All scenes drafted.")
        return state

    @classmethod
    def composer_node(cls, db: Session, state: WritingState):
        state.logs.append("Node: Composer started.")
        
        story = db.query(Story).filter(Story.id == state.story_id).first()
        
        # We merge scenes. To ensure seamless transitions, we let Pro check the draft.
        composer_instruction = (
            "You are a master chief editor. Your task is to combine separate scene drafts into a single, cohesive, "
            "polished book chapter. Maintain style consistency, eliminate abrupt transitions, smooth out repetitive phrases, "
            "and ensure flow. Output ONLY the final polished chapter text without notes or headers."
        )

        scenes_content = "\n\n--- Scene Break ---\n\n".join(state.scene_drafts)
        
        prompt = (
            f"Language: {story.language}\n"
            f"Chapter Outline: {state.outline}\n"
            f"Drafted Scenes:\n{scenes_content}"
        )

        pro_model, _ = models.SystemSetting.get_active_models(db)
        chapter_draft = GeminiService.generate(
            api_key=state.current_api_key,
            model=pro_model,
            prompt=prompt,
            system_instruction=composer_instruction,
            temperature=0.4,
            db=db,
            story_id=state.story_id,
            chapter_no=state.chapter_no,
            node_name="Composer"
        )
        
        state.chapter_draft = chapter_draft
        state.logs.append("Chapter composition complete.")
        return state

    @classmethod
    def run(cls, db: Session, state: WritingState) -> WritingState:
        """Runs the complete writing graph sequence with failover."""
        state = cls.execute_node_with_retry(db, state, cls.build_context_node)
        state = cls.execute_node_with_retry(db, state, cls.scene_planner_node)
        state = cls.execute_node_with_retry(db, state, cls.scene_writer_node)
        state = cls.execute_node_with_retry(db, state, cls.composer_node)
        return state

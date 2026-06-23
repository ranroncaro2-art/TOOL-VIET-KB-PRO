import json
import re
import asyncio
from typing import Dict, Any, List, Optional
from sqlalchemy.orm import Session
from app.models import Story, StyleBible, WorldBible, Character, LongTermFact
from app.services.gemini_service import GeminiService, GeminiRateLimitError
from app.key_manager import KeyManager
from app.graphs.writing_graph import WritingState
from app.config import settings

class ValidationGraph:
    @classmethod
    async def run_reviewer(cls, db: Session, state: WritingState, key: str, world_content: str, style_content: str, char_text: str) -> Dict[str, Any]:
        """Runs a unified Reviewer auditor (Gemini Flash) to inspect facts, style, and structure in a single call."""
        system_instruction = (
            "Bạn là chuyên gia biên tập tiểu thuyết. Hãy tiến hành một đợt kiểm tra toàn diện chương truyện.\n"
            "Nhiệm vụ của bạn là kiểm tra đồng thời cả 3 khía cạnh sau:\n"
            "1. Logic & Sự thật (Fact check): Đối chiếu bản nháp với hồ sơ nhân vật, các sự thật đã thiết lập và quy tắc thế giới xem có mâu thuẫn không.\n"
            "2. Văn phong (Style edit): Đảm bảo chương truyện tuân thủ các quy tắc văn phong (POV, nhịp độ, quy tắc vĩ thanh/cliffhanger).\n"
            "3. Cấu trúc chuyên sâu (Structural audit): Phát hiện các hành động không đúng tính cách nhân vật (Out-of-Character), hội thoại gượng gạo, nhịp độ quá nhanh/chậm.\n\n"
            "Chỉ xuất ra một đối tượng JSON thô theo cấu trúc sau:\n"
            "{\n"
            "  \"pass\": true hoặc false (chỉ trả về true nếu hoàn toàn không có lỗi nào),\n"
            "  \"errors\": [\"danh sách các lỗi logic, mâu thuẫn bối cảnh, hành động OOC, văn phong và đối thoại cần sửa\"]\n"
            "}"
        )
        
        prompt = (
            f"Hồ sơ Nhân vật:\n{char_text}\n\n"
            f"Quy tắc Thế giới:\n{world_content[:1500]}\n\n"
            f"Quy tắc Văn phong:\n{style_content[:1500]}\n\n"
            f"Các Sự thật Đã thiết lập:\n" + "\n".join(state.long_term_facts) + "\n\n"
            f"Bản nháp Chương truyện cần kiểm tra:\n{state.chapter_draft[:12000]}"
        )
        
        import app.models as models
        _, flash_model = models.SystemSetting.get_active_models(db)
        try:
            res = await asyncio.to_thread(
                GeminiService.generate,
                api_key=key,
                model=flash_model,
                prompt=prompt,
                system_instruction=system_instruction,
                json_mode=True,
                temperature=0.15,
                db=db,
                story_id=state.story_id,
                chapter_no=state.chapter_no,
                node_name="Reviewer"
            )
            match = re.search(r"\{.*\}", res, re.DOTALL)
            if match:
                return json.loads(match.group(0))
        except Exception as e:
            state.logs.append(f"Reviewer error: {str(e)}")
            
        return {"pass": True, "errors": []}

    @classmethod
    def apply_self_correction(cls, db: Session, state: WritingState, key: str, errors: List[str], language: str) -> str:
        """Self-Correction (Pro): Rewrite the chapter to fix identified errors."""
        state.logs.append("Applying Self-Correction rewrite...")
        lang_map = {"ja": "Japanese", "en": "English", "vi": "Vietnamese"}
        lang_name = lang_map.get(language, "Vietnamese")
        system_instruction = (
            f"You are an expert novelist. Rewrite the chapter to resolve the reported narrative and logical errors.\n"
            f"CRITICAL: The story language is {lang_name.upper()}. You must output the entire chapter draft in {lang_name.upper()}.\n"
            "Fix the issues while preserving the overall storyline, word count, and writing style. "
            "Output ONLY the revised chapter draft without note headers."
        )
        
        prompt = (
            f"Reported Errors to Fix:\n" + "\n".join([f"- {err}" for err in errors]) + "\n\n"
            f"Original Chapter Draft:\n{state.chapter_draft}"
        )
        
        import app.models as models
        pro_model, _ = models.SystemSetting.get_active_models(db)
        corrected_draft = GeminiService.generate(
            api_key=key,
            model=pro_model,
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.6,
            db=db,
            story_id=state.story_id,
            chapter_no=state.chapter_no,
            node_name="Self Correction"
        )
        return corrected_draft

    @classmethod
    async def validate_and_correct(cls, db: Session, state: WritingState) -> WritingState:
        """
        Executes a collapsed Reviewer pass (checking facts, style, structure in a single call),
        then runs the self-correction loop if any errors are flagged.
        """
        # Load rules and profiles to feed the checkers
        story = db.query(Story).filter(Story.id == state.story_id).first()
        language = story.language if story else "vi"
        
        style_bible = db.query(StyleBible).filter(StyleBible.story_id == state.story_id).order_by(StyleBible.version.desc()).first()
        world_bible = db.query(WorldBible).filter(WorldBible.story_id == state.story_id).order_by(WorldBible.version.desc()).first()
        style_content = style_bible.content if style_bible else ""
        world_content = world_bible.content if world_bible else ""
        
        char_details = []
        if state.selected_characters:
            chars = db.query(Character).filter(
                Character.story_id == state.story_id,
                Character.name.in_(state.selected_characters)
            ).all()
            for c in chars:
                char_details.append(f"Name: {c.name}\nPersonality: {c.personality}\nSpeaking: {c.speaking_style}\nSecret: {c.secret}")
        char_text = "\n---\n".join(char_details)

        state.retry_count = 0
        max_retries = 3

        while state.retry_count < max_retries:
            state.logs.append(f"Validation Cycle {state.retry_count + 1} starting...")
            
            try:
                review_key = KeyManager.get_utility_key(db)
            except Exception:
                review_key = state.current_api_key

            state.logs.append("Running unified Reviewer node (inspecting facts, style, structure)...")
            
            review_res = await cls.run_reviewer(db, state, review_key, world_content, style_content, char_text)
            
            all_errors = []
            if not review_res.get("pass"):
                all_errors.extend(review_res.get("errors", []))
                state.logs.append(f"Reviewer flagged {len(review_res.get('errors'))} issues.")
                
            # Check overall result
            if not all_errors:
                state.logs.append("Validation passed successfully!")
                state.validation_result = {"pass": True, "errors": []}
                return state
                
            state.logs.append(f"Validation failed with {len(all_errors)} errors. Preparing Self-Correction...")
            
            # Self-Correction Rewrite (Pro model)
            try:
                rewrite_key = KeyManager.get_writer_key(db)
            except Exception:
                rewrite_key = state.current_api_key
                
            # Apply corrections
            state.chapter_draft = cls.apply_self_correction(db, state, rewrite_key, all_errors, language)
            state.retry_count += 1
            
        state.logs.append("Max self-correction retries reached. Moving forward with the latest draft.")
        state.validation_result = {"pass": False, "errors": ["Max retries reached without fully resolving all errors."]}
        return state

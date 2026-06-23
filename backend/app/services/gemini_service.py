import json
import re
from typing import List, Dict, Any, Optional
from jinja2 import Template
from google import genai
from google.genai import types
from google.genai.errors import APIError
from app.config import settings

class GeminiAPIError(Exception):
    """Base exception for Gemini API calls."""
    def __init__(self, message: str, status_code: Optional[int] = None):
        super().__init__(message)
        self.status_code = status_code

class GeminiRateLimitError(GeminiAPIError):
    """Exception raised when API returns 429 or quota exhaustion."""
    pass

class GeminiService:
    @staticmethod
    def get_client(api_key: str) -> genai.Client:
        """Create a GenAI client with a specific API key."""
        return genai.Client(api_key=api_key)

    @classmethod
    def calculate_cost(cls, model: str, input_tokens: int, cached_input_tokens: int, output_tokens: int) -> float:
        model_lower = model.lower()
        if "pro" in model_lower:
            input_rate = 0.00000125
            cached_rate = 0.0000003125
            output_rate = 0.000005
        else:
            input_rate = 0.000000075
            cached_rate = 0.00000001875
            output_rate = 0.0000003
            
        cost = (input_tokens * input_rate) + (cached_input_tokens * cached_rate) + (output_tokens * output_rate)
        return cost

    @classmethod
    def generate(
        cls,
        api_key: str,
        model: str,
        prompt: str,
        system_instruction: Optional[str] = None,
        json_mode: bool = False,
        cache_name: Optional[str] = None,
        temperature: float = 0.7,
        db: Optional[Any] = None,
        story_id: Optional[int] = None,
        chapter_no: Optional[int] = None,
        node_name: Optional[str] = None
    ) -> str:
        # Delay mechanism for Free Tier to prevent 429 rate limit (15 RPM)
        if db is not None:
            try:
                from app.models import SystemSetting
                api_mode = SystemSetting.get_val(db, "api_mode", "free")
                if api_mode == "free":
                    import time
                    delay = int(SystemSetting.get_val(db, "free_mode_delay_seconds", "4"))
                    if delay > 0:
                        time.sleep(delay)
            except Exception as e:
                print(f"Error applying rate limit delay: {e}")

        client = cls.get_client(api_key)
        
        config = types.GenerateContentConfig(
            temperature=temperature,
        )
        
        if system_instruction:
            config.system_instruction = system_instruction
            
        if json_mode:
            config.response_mime_type = "application/json"
            
        # If context caching is configured (Paid Mode)
        # Note: In google-genai, caching binds to the request configuration.
        # However, for Free Mode we might not use cache_name.
        # But we'll support it if cache_name is provided.
        # Wait, if we use a cache_name, it replaces standard content loading.
        # But the SDK usually takes it inside cached_content parameter.
        # Let's write the config for caching.
        # In Google GenAI API, cache is passed via config.cached_content
        # e.g., cached_content="cachedContents/..."
        # Let's ensure cache_name is set.
        # In google-genai SDK, cached_content is a string referencing the cache resource name
        if cache_name:
            config.cached_content = cache_name

        try:
            response = client.models.generate_content(
                model=model,
                contents=prompt,
                config=config
            )
            
            # Save token usage statistics
            if db is not None and story_id is not None:
                try:
                    usage = getattr(response, "usage_metadata", None)
                    input_tokens = 0
                    output_tokens = 0
                    cached_tokens = 0
                    
                    if usage:
                        input_tokens = getattr(usage, "prompt_token_count", 0) or 0
                        output_tokens = getattr(usage, "candidates_token_count", 0) or 0
                        cached_tokens = getattr(usage, "cached_content_token_count", 0) or 0
                    
                    cost = cls.calculate_cost(model, input_tokens, cached_tokens, output_tokens)
                    
                    from app.models import UsageLog
                    log_entry = UsageLog(
                        story_id=story_id,
                        chapter_no=chapter_no,
                        node_name=node_name,
                        model_name=model,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        cached_input_tokens=cached_tokens,
                        estimated_cost=cost
                    )
                    db.add(log_entry)
                    db.flush()
                except Exception as db_err:
                    print(f"Error logging token usage: {str(db_err)}")
                    
            return response.text
        except APIError as e:
            # Check for 429 or quota errors
            err_msg = str(e)
            status_code = getattr(e, "code", None)
            
            if status_code == 429 or "quota" in err_msg.lower() or "exhausted" in err_msg.lower() or "rate limit" in err_msg.lower():
                raise GeminiRateLimitError(f"Gemini Rate Limit Exceeded: {err_msg}", status_code=status_code)
            else:
                raise GeminiAPIError(f"Gemini API Error: {err_msg}", status_code=status_code)
        except Exception as e:
            raise GeminiAPIError(f"Unexpected API error: {str(e)}")

    @classmethod
    def get_embedding(cls, api_key: str, text: str, db: Optional[Any] = None) -> List[float]:
        """Generate text embedding vector using text-embedding-004."""
        # Delay mechanism for Free Tier to prevent 429 rate limit (15 RPM)
        if db is not None:
            try:
                from app.models import SystemSetting
                api_mode = SystemSetting.get_val(db, "api_mode", "free")
                if api_mode == "free":
                    import time
                    delay = int(SystemSetting.get_val(db, "free_mode_delay_seconds", "4"))
                    if delay > 0:
                        time.sleep(delay)
            except Exception as e:
                print(f"Error applying rate limit delay: {e}")

        client = cls.get_client(api_key)
        try:
            response = client.models.embed_content(
                model="text-embedding-004",
                contents=text
            )
            # Response contains embedding.values
            if response.embeddings:
                return response.embeddings[0].values
            raise GeminiAPIError("No embeddings returned by API")
        except APIError as e:
            status_code = getattr(e, "code", None)
            if status_code == 429 or "quota" in str(e).lower():
                raise GeminiRateLimitError(f"Rate limit during embedding: {str(e)}", status_code=status_code)
            raise GeminiAPIError(f"Embedding error: {str(e)}", status_code=status_code)
        except Exception as e:
            raise GeminiAPIError(f"Unexpected embedding error: {str(e)}")

    @classmethod
    def create_context_cache(cls, api_key: str, model: str, name: str, content: str, ttl_minutes: int = 60) -> str:
        """
        Creates a Gemini Context Cache for static content (Style + World bibles).
        Returns the cache name (e.g. 'cachedContents/xyz').
        """
        client = cls.get_client(api_key)
        try:
            # Create a cache
            # In google-genai, we use client.caches.create
            # cache = client.caches.create(
            #     model=model,
            #     config=types.CreateCachedContentConfig(
            #         contents=[content],
            #         display_name=name,
            #         ttl=f"{ttl_minutes*60}s"
            #     )
            # )
            # Let's wrap it.
            cache = client.caches.create(
                model=model,
                config=types.CreateCachedContentConfig(
                    contents=content,
                    display_name=name,
                    ttl=f"{ttl_minutes * 60}s"
                )
            )
            return cache.name
        except Exception as e:
            raise GeminiAPIError(f"Failed to create Gemini context cache: {str(e)}")

    @staticmethod
    def render_prompt(template_content: str, variables: Dict[str, Any]) -> str:
        """Render a prompt template with variables using Jinja2."""
        template = Template(template_content)
        return template.render(**variables)

    @classmethod
    def localize_character_names(cls, api_key: str, names: List[str], target_language: str) -> Dict[str, str]:
        """
        Localize character names. E.g. translation to Japanese Takahashi Ren,
        Vietnamese Minh, English Ryan Carter, based on culture.
        """
        if not names:
            return {}
            
        system_instruction = (
            "You are a linguistic and naming expert. "
            f"Your task is to localize the provided list of character names into names appropriate for a {target_language.upper()} setting. "
            "Make them sound natural, immersive, and consistent with local writing styles.\n"
            "Output ONLY a raw JSON mapping: { \"original_name\": \"localized_name\" }"
        )
        
        prompt = f"Names to localize:\n" + "\n".join([f"- {name}" for name in names])
        
        try:
            res_text = cls.generate(
                api_key=api_key,
                model=settings.MODEL_FLASH,
                prompt=prompt,
                system_instruction=system_instruction,
                json_mode=True
            )
            # Find json block
            match = re.search(r"\{.*\}", res_text, re.DOTALL)
            if match:
                return json.loads(match.group(0))
            return {name: name for name in names}
        except Exception:
            # Fallback to identity mapping if localization fails
            return {name: name for name in names}

    @classmethod
    def translate_story(cls, api_key: str, content: str, source_lang: str, target_lang: str) -> str:
        """Translate content (chapter or bible) from source_lang to target_lang."""
        system_instruction = (
            "You are a professional literary translator. "
            f"Translate the following novel text from {source_lang.upper()} to {target_lang.upper()}.\n"
            "Maintain the literary tone, character voices, pacing, subtext, and emotional resonance. "
            "Do not make it sound machine-translated. Do not add any translator notes, output ONLY the translated story content."
        )
        
        return cls.generate(
            api_key=api_key,
            model=settings.MODEL_PRO, # Use Pro for high quality translation
            prompt=content,
            system_instruction=system_instruction,
            temperature=0.3
        )

    @classmethod
    def compile_prefix_and_suffix(
        cls,
        db: Any,
        language: str,
        memory_text: str,
        task_text: str,
        outline_text: str
    ) -> tuple[str, str]:
        """
        Assembles stable prefix and dynamic suffix based on priority and categories:
        1. System -> 2. Format -> 3. Style (Prefix)
        4. Memory -> 5. Task -> 6. Outline (Suffix)
        """
        import app.models as models
        
        # Fetch active prompts for this language sorted by priority
        db_prompts = db.query(models.Prompt).filter(
            models.Prompt.language == language
        ).order_by(models.Prompt.priority.asc()).all()
        
        prefix_parts = []
        for p in db_prompts:
            if p.category in ["System", "Format", "Style"] and p.is_cacheable:
                prefix_parts.append(p.content)
                
        # Fallback to defaults if DB query is empty
        if not prefix_parts:
            if language == "ja":
                prefix_parts = [
                    # System
                    "Bạn là biên kịch manga YouTube Nhật Bản chuyên tạo ra các câu chuyện có khả năng giữ chân người xem cao.\n\nNhiệm vụ:\n- Chuyển dàn ý thành kịch bản hoàn chỉnh.\n- Giữ logic thời gian và không gian.\n- Giữ nhất quán nhân vật.\n- Giữ nhất quán các chi tiết đã xuất hiện ở các chương trước.\n- Ưu tiên diễn biến, xung đột, cảm xúc và hành động.\n- Không tự ý thay đổi cốt truyện trong dàn ý.\n- Không giải thích quá trình suy luận.\n- Chỉ xuất nội dung truyện.",
                    # Format
                    "[FORMAT TRÌNH BÀY KỊCH BẢN MANGA]\n- Lời dẫn viết tự nhiên.\n- Không dùng markdown.\n- Không dùng ký hiệu đặc biệt.\n- Lời thoại:\n  Nhân vật：「Lời thoại」\n- Độc thoại:\n  Nhân vật：（Nội tâm）\n- Tên riêng nhân vật viết bằng Katakana.\n- Nghiêm cấm sử dụng các dấu ngoặc kép dạng \"\" hoặc '' cho lời thoại. Phải ép buộc dùng dấu ngoặc vuông Nhật 「」 cho đối thoại và （） cho nội tâm.\n- Không viết: Nhân vật：「……」\n- Thay bằng: Nhân vật：「…ん」",
                    # Style
                    "[PHONG CÁCH MANGA YOUTUBE]\n- Ngôi 1.\n- Nhân vật chính xưng 俺.\n- Văn nói tự nhiên.\n- Không dùng văn học hàn lâm.\n- Nhịp kể vừa phải.\n- Show don't tell.\n- Tập trung hành động và tâm lý.\n- Đan xen nội tâm liên tục.\n- Tạo cảm giác nhập vai.\n- Ngôn ngữ phù hợp độ tuổi nhân vật."
                ]
            else:
                prefix_parts = [
                    "Bạn là nhà văn chuyên nghiệp.",
                    "Hãy kể chuyện tự nhiên.",
                    "Show, don't tell."
                ]
            
        prefix_text = "\n\n".join(prefix_parts)
        
        suffix_text = (
            f"=== STORY MEMORY ===\n{memory_text}\n\n"
            f"=== TASK PROMPT ===\n{task_text}\n\n"
            f"=== DÀN Ý CHƯƠNG ===\n{outline_text}"
        )
        
        return prefix_text, suffix_text

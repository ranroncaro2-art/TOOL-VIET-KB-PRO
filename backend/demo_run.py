import sys
import os
import json
import asyncio
from datetime import datetime
from sqlalchemy.orm import Session

# Add current directory to path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from app.database import SessionLocal, engine, Base
from app.main import startup_event
import app.models as models
from app.key_manager import KeyManager
from app.graphs.writing_graph import WritingGraph, WritingState
from app.graphs.validation_graph import ValidationGraph
from app.graphs.memory_graph import MemoryGraph
from app.services.monitor_service import MonitorService

async def main():
    print("=== INITIALIZING DATABASE ===")
    # Seed default prompts, presets, and settings
    startup_event()
    
    db = SessionLocal()
    try:
        # Clear existing keys and register the user's two free API keys
        print("\n=== REGISTERING FREE API KEYS ===")
        db.query(models.ApiKey).delete()
        db.commit()
        
        # Two keys from environment variables or placeholders
        key1 = os.environ.get("GEMINI_API_KEY_1", "PLACEHOLDER_GEMINI_API_KEY_1")
        key2 = os.environ.get("GEMINI_API_KEY_2", "PLACEHOLDER_GEMINI_API_KEY_2")
        
        db_key1 = KeyManager.register_key(db, key1)
        db_key2 = KeyManager.register_key(db, key2)
        print(f"Registered Key 1: ...{key1[-10:]} (status: {db_key1.status})")
        print(f"Registered Key 2: ...{key2[-10:]} (status: {db_key2.status})")
        
        # Force model_pro to use gemini-2.5-flash to bypass free-tier gemini-2.5-pro quota limits
        setting_pro = db.query(models.SystemSetting).filter(models.SystemSetting.key == "model_pro").first()
        if setting_pro:
            setting_pro.value = "gemini-2.5-flash"
        else:
            db.add(models.SystemSetting(key="model_pro", value="gemini-2.5-flash"))
        db.commit()
        print("Set model_pro system setting to 'gemini-2.5-flash' for free tier compatibility.")
        
        # Create a new Story
        print("\n=== CREATING STORY ===")
        story = models.Story(
            title="Chìa Khóa Bí Ẩn",
            description="Câu chuyện học đường kịch tính về bí mật chiếc khóa sắt của Yuki và hành trình tìm kiếm sự thật của Ren.",
            language="ja",
            pov="third_person",
            style="manga_realistic"
        )
        db.add(story)
        db.flush()
        
        # Create default Bibles for this story
        style_bible = models.StyleBible(
            story_id=story.id,
            version=1,
            content="POV: Third Person. Focus on visual actions. Japanese manga script format.\nConversations must use 「」. Thoughts must use （）.\nUse Katakana for character names."
        )
        world_bible = models.WorldBible(
            story_id=story.id,
            version=1,
            content="Setting: Teiko High School. A mysterious club room storage locked for years.\nPower/Lore: Rumors say the former student council president hid evidence of a crime."
        )
        db.add(style_bible)
        db.add(world_bible)
        
        # Add Characters
        char_ren = models.Character(
            story_id=story.id,
            name="Ren",
            profile_json="{}",
            appearance="17 years old, dark hair, keen eyes, curious.",
            personality="Sharp, persistent, analytical, speaks directly.",
            speaking_style="Short declarative sentences.",
            secret="He saw Yuki hiding something last semester."
        )
        char_yuki = models.Character(
            story_id=story.id,
            name="Yuki",
            profile_json="{}",
            appearance="16 years old, quiet, long hair, always wears long sleeves.",
            personality="Introverted, secret-oriented, easily startled.",
            speaking_style="Polite but hesitant, stammers slightly.",
            secret="She has a key to the old club storage room."
        )
        db.add(char_ren)
        db.add(char_yuki)
        
        # Create an Arc
        arc = models.Arc(
            story_id=story.id,
            arc_no=1,
            name="Khởi Đầu Của Nghi Ngờ",
            goal="Ren phát hiện chiếc chìa khóa cũ và bắt đầu tiếp cận Yuki.",
            status="active"
        )
        db.add(arc)
        db.commit()
        
        print(f"Created Story ID: {story.id}, Arc ID: {arc.id}")
        
        # --- CHAPTER 1 GENERATION ---
        print("\n=== GENERATING & VALIDATING CHAPTER 1 ===")
        outline_1 = "Ren nhặt được một chiếc chìa khóa khắc chữ Y.K dưới tủ câu lạc bộ thể thao. Yuki tỏ ra hoảng hốt và giật lại chìa khóa."
        v_state_1 = None
        w_state_1 = None
        for attempt in range(5):
            try:
                # Reset key status and cooldowns
                db.query(models.ApiKey).update({models.ApiKey.status: "active", models.ApiKey.cooldown_until: None})
                db.commit()
                print(f"Chapter 1 Generation Attempt {attempt + 1}...")
                w_state_1 = WritingState(
                    story_id=story.id,
                    chapter_no=1,
                    arc_id=arc.id,
                    outline=outline_1,
                    selected_characters=["Ren", "Yuki"],
                    selected_world_rules=[],
                    logs=[]
                )
                w_state_1 = await asyncio.to_thread(WritingGraph.run, db, w_state_1)
                print("\n=== VALIDATING CHAPTER 1 ===")
                v_state_1 = await ValidationGraph.validate_and_correct(db, w_state_1)
                break
            except Exception as ex:
                if attempt == 4:
                    raise ex
                print(f"Chapter 1 Attempt {attempt + 1} failed: {ex}. Retrying in 10 seconds...")
                await asyncio.sleep(10)

        for log in w_state_1.logs:
            print(f"[Writer Log] {log}")
        for log in v_state_1.logs:
            print(f"[Validator Log] {log}")

        # Approve and save Chapter 1
        print("\n=== APPROVING CHAPTER 1 ===")
        chapter_1 = models.Chapter(
            story_id=story.id,
            arc_id=arc.id,
            chapter_no=1,
            title="Chapter 1: Chiếc Chìa Khóa Thể Thao",
            content=v_state_1.chapter_draft,
            scene_plan=json.dumps(v_state_1.scene_plan)
        )
        db.add(chapter_1)
        db.commit()
        
        # Run Memory Compiler
        print("Running Memory Builder for Chapter 1...")
        MemoryGraph.run_all(
            db=db,
            story_id=story.id,
            arc_id=arc.id,
            chapter_no=1,
            chapter_content=v_state_1.chapter_draft,
            logs=[]
        )
        db.commit()
        
        # --- CHAPTER 2 GENERATION ---
        print("\n=== GENERATING & VALIDATING CHAPTER 2 ===")
        outline_2 = "Ren theo dõi Yuki sau giờ học. Anh thấy cô đứng tần ngần trước cửa phòng kho cũ bỏ hoang. Ren tiến lại gần và bắt chuyện."
        v_state_2 = None
        w_state_2 = None
        for attempt in range(5):
            try:
                # Reset key status and cooldowns
                db.query(models.ApiKey).update({models.ApiKey.status: "active", models.ApiKey.cooldown_until: None})
                db.commit()
                print(f"Chapter 2 Generation Attempt {attempt + 1}...")
                w_state_2 = WritingState(
                    story_id=story.id,
                    chapter_no=2,
                    arc_id=arc.id,
                    outline=outline_2,
                    selected_characters=["Ren", "Yuki"],
                    selected_world_rules=[],
                    logs=[]
                )
                w_state_2 = await asyncio.to_thread(WritingGraph.run, db, w_state_2)
                print("\n=== VALIDATING CHAPTER 2 ===")
                v_state_2 = await ValidationGraph.validate_and_correct(db, w_state_2)
                break
            except Exception as ex:
                if attempt == 4:
                    raise ex
                print(f"Chapter 2 Attempt {attempt + 1} failed: {ex}. Retrying in 10 seconds...")
                await asyncio.sleep(10)

        for log in w_state_2.logs:
            print(f"[Writer Log] {log}")
        for log in v_state_2.logs:
            print(f"[Validator Log] {log}")
            
        # Approve and save Chapter 2
        print("\n=== APPROVING CHAPTER 2 ===")
        chapter_2 = models.Chapter(
            story_id=story.id,
            arc_id=arc.id,
            chapter_no=2,
            title="Chapter 2: Phía Trước Phòng Kho Cũ",
            content=v_state_2.chapter_draft,
            scene_plan=json.dumps(v_state_2.scene_plan)
        )
        db.add(chapter_2)
        db.commit()
        
        # Run Memory Compiler
        print("Running Memory Builder for Chapter 2...")
        MemoryGraph.run_all(
            db=db,
            story_id=story.id,
            arc_id=arc.id,
            chapter_no=2,
            chapter_content=v_state_2.chapter_draft,
            logs=[]
        )
        db.commit()
        
        # --- REPORTING STATISTICS ---
        print("\n=== TOKEN UTILIZATION & COST REPORT ===")
        usage_logs = db.query(models.UsageLog).filter(models.UsageLog.story_id == story.id).all()
        
        total_cost = sum(u.estimated_cost for u in usage_logs)
        total_input = sum(u.input_tokens for u in usage_logs)
        total_output = sum(u.output_tokens for u in usage_logs)
        total_cached = sum(u.cached_input_tokens for u in usage_logs)
        
        print("-" * 80)
        print(f"Total Model Calls:   {len(usage_logs)}")
        print(f"Total Input Tokens:  {total_input:,}")
        print(f"Total Output Tokens: {total_output:,}")
        print(f"Total Cached Tokens: {total_cached:,}")
        print(f"Total Cost (USD):    ${total_cost:.5f}")
        print("-" * 80)
        print(f"{'Node Name':<28} | {'Model Name':<20} | {'Input':<8} | {'Cached':<8} | {'Output':<8} | {'Cost (USD)':<10}")
        print("-" * 80)
        for u in usage_logs:
            print(f"{u.node_name or 'LLM Call':<28} | {u.model_name:<20} | {u.input_tokens:<8} | {u.cached_input_tokens:<8} | {u.output_tokens:<8} | ${u.estimated_cost:.5f}")
        print("-" * 80)
        
    except Exception as e:
        print(f"Execution failed: {str(e)}")
        import traceback
        traceback.print_exc()
    finally:
        db.close()

if __name__ == "__main__":
    asyncio.run(main())

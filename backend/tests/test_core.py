import unittest
from datetime import datetime, timedelta
from app.services.retrieval_service import cosine_similarity
from app.services.gemini_service import GeminiService
from app.services.monitor_service import MonitorService
from app.key_manager import KeyManager
from app.database import Base, engine, SessionLocal
from app.models import ApiKey, Story, Arc, Chapter, PlotThread

class TestNovelWriterCore(unittest.TestCase):
    
    def test_cosine_similarity(self):
        # Orthogonal vectors
        self.assertAlmostEqual(cosine_similarity([1.0, 0.0], [0.0, 1.0]), 0.0)
        # Identical vectors
        self.assertAlmostEqual(cosine_similarity([1.0, 2.0, 3.0], [1.0, 2.0, 3.0]), 1.0)
        # Opposite direction
        self.assertAlmostEqual(cosine_similarity([1.0, -1.0], [-1.0, 1.0]), -1.0)
        # Empty / mismatch vectors
        self.assertEqual(cosine_similarity([1.0], [1.0, 2.0]), 0.0)

    def test_prompt_rendering(self):
        template = "Bạn là {{role}}. Ngôn ngữ: {{lang}}."
        vars = {"role": "nhà văn chuyên nghiệp", "lang": "ja"}
        rendered = GeminiService.render_prompt(template, vars)
        self.assertEqual(rendered, "Bạn là nhà văn chuyên nghiệp. Ngôn ngữ: ja.")

    def test_key_manager_cooldown(self):
        # Setup memory database for testing
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        
        try:
            # Clean existing keys
            db.query(ApiKey).delete()
            db.commit()
            
            # Register two keys
            k1 = KeyManager.register_key(db, "TEST_KEY_VALUE_111111")
            k2 = KeyManager.register_key(db, "TEST_KEY_VALUE_222222")
            
            # Verify they are active
            active = KeyManager.get_all_active_keys(db)
            self.assertEqual(len(active), 2)
            
            # Put K1 on cooldown
            KeyManager.mark_key_cooldown(db, "TEST_KEY_VALUE_111111", cooldown_minutes=5)
            
            # Retrieve active keys
            active_after = KeyManager.get_all_active_keys(db)
            self.assertEqual(len(active_after), 1)
            self.assertEqual(active_after[0].key_value, "TEST_KEY_VALUE_222222")
            
            # Get utility key - should fallback to K2 since K1 is in cooldown
            ut_key = KeyManager.get_utility_key(db)
            self.assertEqual(ut_key, "TEST_KEY_VALUE_222222")
            
        finally:
            # Cleanup
            db.query(ApiKey).delete()
            db.commit()
            db.close()

    def test_prompt_prefix_suffix_compilation(self):
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        import app.models as models
        
        try:
            # Clean
            db.query(models.Prompt).delete()
            db.commit()
            
            # Create three prompts with categories, cacheable, and priorities
            p1 = models.Prompt(name="System P", language="ja", category="System", is_cacheable=True, priority=1, content="System Instruction")
            p2 = models.Prompt(name="Format P", language="ja", category="Format", is_cacheable=True, priority=2, content="Format Guidelines")
            p3 = models.Prompt(name="Style P", language="ja", category="Style", is_cacheable=True, priority=3, content="Style Details")
            p4 = models.Prompt(name="Task P", language="ja", category="Outline Expansion", is_cacheable=False, priority=10, content="Task Instruction")
            
            db.add_all([p1, p2, p3, p4])
            db.commit()
            
            prefix, suffix = GeminiService.compile_prefix_and_suffix(
                db=db,
                language="ja",
                memory_text="History Details",
                task_text="Target Details",
                outline_text="Chapter Outline"
            )
            
            # Check sorting and inclusion
            self.assertIn("System Instruction", prefix)
            self.assertIn("Format Guidelines", prefix)
            self.assertIn("Style Details", prefix)
            
            # Check suffix assembly
            self.assertIn("History Details", suffix)
            self.assertIn("Target Details", suffix)
            self.assertIn("Chapter Outline", suffix)
            
        finally:
            db.query(models.Prompt).delete()
            db.commit()
            db.close()

    def test_system_settings_workflow_mode(self):
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        import app.models as models
        
        try:
            # Clean settings
            db.query(models.SystemSetting).delete()
            db.commit()
            
            # Seed default settings
            db.add_all([
                models.SystemSetting(key="workflow_mode", value="hybrid"),
                models.SystemSetting(key="model_pro", value="gemini-2.5-pro"),
                models.SystemSetting(key="model_flash", value="gemini-2.5-flash")
            ])
            db.commit()
            
            # Under hybrid mode:
            pro_model, flash_model = models.SystemSetting.get_active_models(db)
            self.assertEqual(pro_model, "gemini-2.5-pro")
            self.assertEqual(flash_model, "gemini-2.5-flash")
            
            # Change workflow_mode to flash_only:
            wf_setting = db.query(models.SystemSetting).filter(models.SystemSetting.key == "workflow_mode").first()
            wf_setting.value = "flash_only"
            db.commit()
            
            # Under flash_only mode:
            pro_model, flash_model = models.SystemSetting.get_active_models(db)
            self.assertEqual(pro_model, "gemini-2.5-flash")
            self.assertEqual(flash_model, "gemini-2.5-flash")
            
        finally:
            db.query(models.SystemSetting).delete()
            db.commit()
            db.close()

    def test_plaintext_outline_parser(self):
        from app.main import parse_story_outline
        
        sample_text = """
[CHƯƠNG: 1]
[TIÊU_ĐỀ: HOOK – ĐÊM ĐẦU TIÊN]
[TARGET: 3000]

[CẢNH: 1]
[BẮT_ĐẦU_NỘI_DUNG]
* (01:37 sáng – mở đầu hành động)
* Bố nhận thông báo camera
* Mở điện thoại → thấy người trong phòng khách
[KẾT_THÚC_NỘI_DUNG]

[CẢNH: 2]
[BẮT_ĐẦU_NỘI_DUNG]
* Tua lại video
* Người đó xuất hiện “từ hư không”
[KẾT_THÚC_NỘI_DUNG]
"""
        chapters = parse_story_outline(sample_text)
        self.assertEqual(len(chapters), 1)
        
        chap = chapters[0]
        self.assertEqual(chap["chapter_no"], 1)
        self.assertEqual(chap["title"], "HOOK – ĐÊM ĐẦU TIÊN")
        self.assertEqual(chap["target_length"], 3000)
        self.assertEqual(len(chap["scene_plan"]), 2)
        
        scene1 = chap["scene_plan"][0]
        self.assertEqual(scene1["scene_no"], 1)
        self.assertIn("Bố nhận thông báo camera", scene1["objective"])
        
        scene2 = chap["scene_plan"][1]
        self.assertEqual(scene2["scene_no"], 2)
        self.assertIn("Tua lại video", scene2["objective"])

if __name__ == '__main__':
    unittest.main()

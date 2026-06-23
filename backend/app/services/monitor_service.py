from sqlalchemy.orm import Session
from typing import Dict, Any, List
import json
import re
from app.models import Arc, Chapter, PlotThread, Event, SystemSetting
from app.services.gemini_service import GeminiService
from app.config import settings

class MonitorService:
    @classmethod
    def monitor_arc_health(
        cls,
        db: Session,
        story_id: int,
        arc_id: int,
        api_key: str
    ) -> Dict[str, Any]:
        """
        Arc Health Monitor:
        Evaluates Arc Goal Progress, Thread Count, and Arc Length.
        If 10 chapters pass with no progress -> Arc Risk = HIGH.
        """
        # Get current arc
        arc = db.query(Arc).filter(Arc.id == arc_id).first()
        if not arc:
            return {"risk_level": "LOW", "reason": "No active arc found."}

        # Count chapters in this arc
        chapters = db.query(Chapter).filter(Chapter.arc_id == arc_id).order_by(Chapter.chapter_no).all()
        arc_length = len(chapters)
        
        # Get all plot threads under this arc
        open_threads = db.query(PlotThread).filter(
            PlotThread.story_id == story_id,
            PlotThread.status == "open"
        ).all()
        
        thread_count = len(open_threads)
        
        # Check progress: has any thread been closed in the last 10 chapters?
        # Let's check closed threads created in this arc context
        closed_threads_in_arc = db.query(PlotThread).filter(
            PlotThread.story_id == story_id,
            PlotThread.arc_id == arc_id,
            PlotThread.status == "closed"
        ).count()
        
        # If the arc is long (>= 10 chapters) and we haven't closed any plot threads recently
        # Let's run a Gemini Flash check on the chapter drafts to see if the main arc goal has progressed
        risk_level = "LOW"
        reason = "Arc is progressing healthily."
        
        if arc_length >= 10 and closed_threads_in_arc == 0:
            # High risk of stalling! Call Gemini Flash to verify progress
            recent_texts = "\n".join([f"Chap {c.chapter_no} Outline: {c.scene_plan or c.title}" for c in chapters[-5:]])
            
            system_instruction = (
                "You are a narrative structure auditor. Review the recent chapter plans and evaluate if the plot is moving forward "
                "or if it is stalling / spinning wheels without resolving or escalating conflicts.\n"
                "Output ONLY a raw JSON: { \"risk\": \"HIGH\" | \"LOW\", \"reason\": \"string explanation\" }"
            )
            
            prompt = (
                f"Arc Goal: {arc.goal or 'Write the current arc'}\n"
                f"Open Threads: {', '.join([t.description for t in open_threads])}\n"
                f"Recent Chapters:\n{recent_texts}"
            )
            
            _, flash_model = SystemSetting.get_active_models(db)
            try:
                res = GeminiService.generate(
                    api_key=api_key,
                    model=flash_model,
                    prompt=prompt,
                    system_instruction=system_instruction,
                    json_mode=True,
                    db=db,
                    story_id=story_id,
                    node_name="Arc Health Monitor"
                )
                match = re.search(r"\{.*\}", res, re.DOTALL)
                if match:
                    data = json.loads(match.group(0))
                    risk_level = data.get("risk", "LOW")
                    reason = data.get("reason", "Stalled plot identified by AI analysis.")
            except Exception as e:
                # Fallback to high if simple count check triggers it
                risk_level = "HIGH"
                reason = f"Automated trigger: {arc_length} chapters written in this arc with zero resolved plot threads."
                
        # If chapter length is large but still under 10, keep LOW
        if arc_length >= 10 and risk_level == "HIGH":
            return {"risk_level": "HIGH", "reason": reason, "arc_length": arc_length, "thread_count": thread_count}
            
        return {"risk_level": "LOW", "reason": reason, "arc_length": arc_length, "thread_count": thread_count}

    @classmethod
    def compress_arc(
        cls,
        db: Session,
        story_id: int,
        arc_id: int,
        api_key: str
    ) -> str:
        """
        Arc Compression:
        Every 10 chapters, nens the events and outline into a clean 800-token Arc Summary,
        archives past event embeddings (is_archived=True) and resets recent memory.
        """
        arc = db.query(Arc).filter(Arc.id == arc_id).first()
        if not arc:
            return ""

        # Fetch chapters in this arc
        chapters = db.query(Chapter).filter(Chapter.arc_id == arc_id).order_by(Chapter.chapter_no).all()
        
        # Fetch unarchived events
        events = db.query(Event).filter(
            Event.story_id == story_id,
            Event.is_archived == False
        ).order_by(Event.chapter_no).all()
        
        events_text = "\n".join([f"Chap {e.chapter_no}: {e.event_text}" for e in events])
        
        system_instruction = (
            "You are a master editor. Summarize the major plot developments, character transformations, "
            "and resolved conflicts of the provided chapters into a highly concise recap.\n"
            "Target length: 500-800 tokens. Focus only on permanent facts and plot shifts."
        )
        
        prompt = (
            f"Arc Name: {arc.name}\n"
            f"Arc Goal: {arc.goal}\n"
            f"Recent Chapter Events:\n{events_text}"
        )
        
        # Generate summary
        _, flash_model = SystemSetting.get_active_models(db)
        summary = GeminiService.generate(
            api_key=api_key,
            model=flash_model,
            prompt=prompt,
            system_instruction=system_instruction,
            temperature=0.4,
            db=db,
            story_id=story_id,
            node_name="Arc Compression"
        )
        
        # Save summary to arc
        arc.summary = summary
        
        # Archive events of this story to free context slot
        for event in events:
            event.is_archived = True
            
        db.commit()
        return summary

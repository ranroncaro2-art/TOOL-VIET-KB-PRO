import asyncio
from typing import Dict, List, Any, Optional
import uuid
from datetime import datetime

class QueueManager:
    def __init__(self):
        self.tasks: Dict[str, Dict[str, Any]] = {}
        self.queue: List[str] = []
        self.active_tasks: Dict[str, asyncio.Task] = {}
        self.lock = asyncio.Lock()
        self.runner_task: Optional[asyncio.Task] = None
        self.execute_callback = None  # To be registered by main.py

    def start(self):
        if not self.runner_task or self.runner_task.done():
            self.runner_task = asyncio.create_task(self._run_queue())

    async def add_task(self, task_type: str, story_id: int, params: Dict[str, Any]) -> str:
        task_id = str(uuid.uuid4())
        task_info = {
            "id": task_id,
            "story_id": story_id,
            "type": task_type,
            "status": "pending",
            "created_at": datetime.utcnow().isoformat(),
            "started_at": None,
            "completed_at": None,
            "logs": ["Task added to queue. Waiting in line..."],
            "params": params,
            "draft": "",
            "scene_plan": []
        }
        
        # UI compatibility mappings
        if task_type == "auto_write":
            task_info["start_chapter_no"] = params.get("start_chapter_no")
            task_info["end_chapter_no"] = params.get("end_chapter_no")
            task_info["current_chapter"] = params.get("start_chapter_no")
        else:
            task_info["chapter_no"] = params.get("chapter_no")
            task_info["arc_id"] = params.get("arc_id")
            task_info["title"] = params.get("title")
            task_info["outline"] = params.get("outline")
            
        async with self.lock:
            self.tasks[task_id] = task_info
            self.queue.append(task_id)
            
        return task_id

    async def cancel_task(self, task_id: str):
        async with self.lock:
            task = self.tasks.get(task_id)
            if not task:
                return False
            
            if task["status"] in ["completed", "failed", "cancelled"]:
                return True
                
            task["status"] = "cancelled"
            task["logs"].append("Task was cancelled by the user.")
            task["completed_at"] = datetime.utcnow().isoformat()
            
            if task_id in self.active_tasks:
                self.active_tasks[task_id].cancel()
                
            if task_id in self.queue:
                self.queue.remove(task_id)
                
            return True

    async def cancel_story_tasks(self, story_id: int):
        to_cancel = []
        async with self.lock:
            for task_id, task in self.tasks.items():
                if task["story_id"] == story_id and task["status"] in ["pending", "running"]:
                    to_cancel.append(task_id)
                    
        for task_id in to_cancel:
            await self.cancel_task(task_id)

    async def get_queue_status(self) -> List[Dict[str, Any]]:
        async with self.lock:
            running_and_pending = []
            finished = []
            
            for task_id, task in self.tasks.items():
                title = task.get("title")
                if not title:
                    if task["type"] == "auto_write":
                        title = f"Auto-Write Chapters {task.get('start_chapter_no')} to {task.get('end_chapter_no')}"
                    else:
                        title = f"Chapter {task.get('chapter_no')} Draft"
                        
                clean_task = {
                    "id": task["id"],
                    "story_id": task["story_id"],
                    "type": task["type"],
                    "status": task["status"],
                    "created_at": task["created_at"],
                    "started_at": task["started_at"],
                    "completed_at": task["completed_at"],
                    "logs_count": len(task["logs"]),
                    "title": title,
                    "current_chapter": task.get("current_chapter"),
                    "chapter_no": task.get("chapter_no")
                }
                if task["status"] in ["pending", "running"]:
                    running_and_pending.append(clean_task)
                else:
                    finished.append(clean_task)
                    
            finished.sort(key=lambda x: x["completed_at"] or "", reverse=True)
            return running_and_pending + finished

    async def _run_queue(self):
        while True:
            try:
                task_id = None
                async with self.lock:
                    if self.queue:
                        task_id = self.queue.pop(0)
                        
                if not task_id:
                    await asyncio.sleep(1)
                    continue
                    
                task = self.tasks.get(task_id)
                if not task or task["status"] == "cancelled":
                    continue
                    
                task["status"] = "running"
                task["started_at"] = datetime.utcnow().isoformat()
                task["logs"].append("Starting execution...")
                
                if self.execute_callback:
                    coro = self.execute_callback(task)
                    async_task = asyncio.create_task(coro)
                    self.active_tasks[task_id] = async_task
                    
                    try:
                        await async_task
                    except asyncio.CancelledError:
                        task["status"] = "cancelled"
                        task["logs"].append("Execution aborted (Cancelled).")
                    except Exception as e:
                        task["status"] = "failed"
                        task["logs"].append(f"Execution failed: {str(e)}")
                    finally:
                        task["completed_at"] = datetime.utcnow().isoformat()
                        self.active_tasks.pop(task_id, None)
                else:
                    task["status"] = "failed"
                    task["logs"].append("Queue runner execution callback is not set.")
                    task["completed_at"] = datetime.utcnow().isoformat()
                    
            except Exception as queue_err:
                print(f"Error in queue runner loop: {str(queue_err)}")
                await asyncio.sleep(1)

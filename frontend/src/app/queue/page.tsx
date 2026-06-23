"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { 
  Play, Square, Trash2, RefreshCw, Activity, Clock, CheckCircle2, 
  XCircle, AlertCircle, Loader2, ArrowRight 
} from "lucide-react";
import Link from "next/link";

interface QueuedTask {
  id: string;
  story_id: number;
  type: string;
  status: string;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  logs_count: number;
  title: string;
  current_chapter?: number;
  chapter_no?: number;
}

interface Story {
  id: number;
  title: string;
}

export default function QueuePage() {
  const [tasks, setTasks] = useState<QueuedTask[]>([]);
  const [stories, setStories] = useState<Record<number, string>>({});
  const [loading, setLoading] = useState(true);
  const [actionInProgress, setActionInProgress] = useState<string | null>(null);

  const fetchQueue = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/queue");
      if (res.ok) {
        const data = await res.json();
        setTasks(data);
      }
    } catch (e) {
      console.error("Failed to fetch task queue status:", e);
    } finally {
      setLoading(false);
    }
  };

  const fetchStories = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/stories");
      if (res.ok) {
        const data = await res.json();
        const map: Record<number, string> = {};
        data.forEach((s: Story) => {
          map[s.id] = s.title;
        });
        setStories(map);
      }
    } catch (e) {
      console.error("Failed to load stories lookup:", e);
    }
  };

  useEffect(() => {
    fetchStories();
    fetchQueue();

    // Auto-refresh the queue list every 1.5 seconds
    const interval = setInterval(fetchQueue, 1500);
    return () => clearInterval(interval);
  }, []);

  const handleCancelTask = async (taskId: string) => {
    if (!confirm("Bạn có chắc chắn muốn dừng/hủy tác vụ này?")) return;
    setActionInProgress(taskId);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/queue/${taskId}/cancel`, {
        method: "POST"
      });
      if (res.ok) {
        fetchQueue();
      } else {
        alert("Không thể hủy tác vụ.");
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setActionInProgress(null);
    }
  };

  const handleCancelStoryTasks = async (storyId: number) => {
    const storyTitle = stories[storyId] || `Truyện #${storyId}`;
    if (!confirm(`Hủy tất cả các tác vụ đang chờ và đang hoạt động của "${storyTitle}"?`)) return;
    setActionInProgress(`story-${storyId}`);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/queue/cancel`, {
        method: "POST"
      });
      if (res.ok) {
        fetchQueue();
      } else {
        alert("Không thể hủy các tác vụ của truyện.");
      }
    } catch (e) {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setActionInProgress(null);
    }
  };

  const runningTask = tasks.find(t => t.status === "running");
  const pendingTasks = tasks.filter(t => t.status === "pending");
  const finishedTasks = tasks.filter(t => ["completed", "failed", "cancelled"].includes(t.status));

  const formatTime = (isoString: string | null) => {
    if (!isoString) return "-";
    return new Date(isoString).toLocaleTimeString();
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "running":
        return (
          <span className="badge badge-warning flex items-center gap-1 scale-90 py-1">
            <Loader2 size={12} className="animate-spin" />
            <span>Đang chạy</span>
          </span>
        );
      case "pending":
        return (
          <span className="badge badge-info scale-90 py-1">
            <span>Đang chờ</span>
          </span>
        );
      case "completed":
        return (
          <span className="badge badge-success flex items-center gap-1 scale-90 py-1">
            <CheckCircle2 size={12} />
            <span>Thành công</span>
          </span>
        );
      case "failed":
        return (
          <span className="badge badge-danger flex items-center gap-1 scale-90 py-1">
            <AlertCircle size={12} />
            <span>Thất bại</span>
          </span>
        );
      case "cancelled":
        return (
          <span className="badge flex items-center gap-1 scale-90 py-1 border border-white/10 bg-white/5 text-gray-400">
            <XCircle size={12} />
            <span>Đã hủy</span>
          </span>
        );
      default:
        return <span className="badge scale-90">{status}</span>;
    }
  };

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white flex items-center gap-2">
              <Activity className="text-indigo-400" />
              <span>Hàng đợi Tác vụ API</span>
            </h1>
            <p className="text-gray-400 mt-1 text-sm">
              Xem và quản lý các tiến trình khởi tạo đang chạy, đang chờ và lịch sử. Chạy tuần tự để tránh bị giới hạn API.
            </p>
          </div>
          <button onClick={fetchQueue} className="btn btn-secondary py-2 px-3 flex items-center gap-1">
            <RefreshCw size={16} />
            <span>Làm mới</span>
          </button>
        </header>

        {/* 1. CURRENTLY RUNNING EXECUTION */}
        {runningTask ? (
          <section className="glass-card border-indigo-500/20 bg-indigo-500/5 mb-8 flex flex-col gap-4">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] text-indigo-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <span className="inline-block w-2.5 h-2.5 rounded-full bg-indigo-500 animate-ping shrink-0" />
                  Tiến trình đang chạy
                </span>
                <h2 className="text-xl font-bold text-white mt-1.5">{runningTask.title}</h2>
                <p className="text-xs text-gray-400 mt-1">
                  Truyện: <strong className="text-gray-300">{stories[runningTask.story_id] || `Truyện #${runningTask.story_id}`}</strong>
                </p>
              </div>
              <div className="flex gap-2">
                <Link 
                  href={`/stories/${runningTask.story_id}/write?task_id=${runningTask.id}&type=${runningTask.type}`}
                  className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1"
                >
                  <span>Mở Console</span>
                  <ArrowRight size={12} />
                </Link>
                <button
                  onClick={() => handleCancelTask(runningTask.id)}
                  disabled={actionInProgress === runningTask.id}
                  className="btn btn-secondary border-red-500/30 text-red-400 hover:bg-red-500/10 py-1.5 px-3 text-xs flex items-center gap-1"
                >
                  <Square size={12} />
                  <span>Dừng thực thi</span>
                </button>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-t border-white/5 pt-4 text-xs">
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Bắt đầu lúc</span>
                <span className="text-gray-300 font-mono mt-0.5 block">{formatTime(runningTask.started_at)}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Loại tác vụ</span>
                <span className="text-gray-300 font-bold mt-0.5 block uppercase">{runningTask.type.replace("_", " ")}</span>
              </div>
              <div>
                <span className="text-gray-500 font-semibold block uppercase text-[10px]">Phạm vi hiện tại</span>
                <span className="text-gray-300 font-bold mt-0.5 block">
                  {runningTask.type === "auto_write" 
                    ? `Chương ${runningTask.current_chapter || "?"}` 
                    : `Chương ${runningTask.chapter_no || "?"}`}
                </span>
              </div>
            </div>
          </section>
        ) : (
          <section className="glass-card mb-8 py-10 text-center border-dashed border-white/5 flex flex-col items-center justify-center text-gray-500 gap-2">
            <Clock size={36} className="text-gray-600 animate-pulse" />
            <p className="text-sm font-semibold">Không có tác vụ API nào đang chạy</p>
            <p className="text-xs text-gray-600">Các tác vụ từ nhập dàn ý hoặc viết tự động sẽ được thực thi tuần tự tại đây.</p>
          </section>
        )}

        <div className="grid grid-cols-2 gap-8 items-start" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr' }}>
          
          {/* 2. PENDING QUEUE */}
          <div className="glass-card flex flex-col gap-4">
            <h3 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider flex items-center gap-2">
              <span>Hàng đợi chờ ({pendingTasks.length})</span>
            </h3>

            {pendingTasks.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-600 border border-dashed border-white/5 rounded-xl">
                Không có tác vụ nào đang chờ.
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {pendingTasks.map((task, index) => (
                  <div key={task.id} className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center hover:border-indigo-500/10">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="w-5 h-5 rounded-full bg-indigo-500/20 text-indigo-400 flex items-center justify-center text-[10px] font-bold">
                          {index + 1}
                        </span>
                        <h4 className="font-bold text-xs text-white">{task.title}</h4>
                      </div>
                      <p className="text-[10px] text-gray-500 mt-1 pl-7">
                        Truyện: <strong>{stories[task.story_id] || `Truyện #${task.story_id}`}</strong> • Đã xếp hàng: {formatTime(task.created_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleCancelTask(task.id)}
                        disabled={actionInProgress === task.id}
                        className="btn btn-secondary p-1.5 hover:text-red-400 hover:border-red-500/20"
                        title="Xóa khỏi hàng đợi"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 3. EXECUTION HISTORY */}
          <div className="glass-card flex flex-col gap-4">
            <h3 className="card-title text-gray-400 font-bold uppercase text-xs tracking-wider">
              Lịch sử thực thi ({finishedTasks.length})
            </h3>

            {finishedTasks.length === 0 ? (
              <div className="text-center py-12 text-xs text-gray-600 border border-dashed border-white/5 rounded-xl">
                Chưa ghi nhận lịch sử thực thi nào.
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[400px] overflow-y-auto pr-1">
                {finishedTasks.map((task) => (
                  <div key={task.id} className="p-3 rounded-lg bg-white/5 border border-white/5 flex justify-between items-center text-xs">
                    <div>
                      <h4 className="font-bold text-white">{task.title}</h4>
                      <p className="text-[10px] text-gray-500 mt-1">
                        Truyện: <strong>{stories[task.story_id] || `Truyện #${task.story_id}`}</strong> • Kết thúc: {formatTime(task.completed_at)}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      {getStatusBadge(task.status)}
                      <Link 
                        href={`/stories/${task.story_id}/write?task_id=${task.id}&type=${task.type}`}
                        className="p-1 hover:text-indigo-400 text-gray-500"
                        title="Xem nhật ký lịch sử"
                      >
                        <ArrowRight size={14} />
                      </Link>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </main>
    </div>
  );
}

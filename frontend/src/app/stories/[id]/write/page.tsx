"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { 
  ArrowLeft, Sparkles, Terminal, CheckCircle2, AlertTriangle, 
  HelpCircle, Users, Settings, Play, Check, Eye
} from "lucide-react";

interface Character {
  id: number;
  name: string;
}

import { Suspense } from "react";

function WritingCenterContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const storyId = params.id;
  const chapterNo = parseInt(searchParams.get("chapter_no") || "1");
  const arcId = parseInt(searchParams.get("arc_id") || "1");

  const logContainerRef = useRef<HTMLDivElement | null>(null);

  // Selection state
  const [outline, setOutline] = useState("");
  const [characters, setCharacters] = useState<Character[]>([]);
  const [selectedChars, setSelectedChars] = useState<string[]>([]);
  const [selectedWorldRules, setSelectedWorldRules] = useState<string[]>([]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const savedOutline = localStorage.getItem(`story_${storyId}_write_outline`);
      if (savedOutline) setOutline(savedOutline);
      
      const savedChars = localStorage.getItem(`story_${storyId}_write_chars`);
      if (savedChars) {
        try {
          setSelectedChars(JSON.parse(savedChars));
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, [storyId]);

  const handleOutlineChange = (text: string) => {
    setOutline(text);
    if (typeof window !== "undefined") {
      localStorage.setItem(`story_${storyId}_write_outline`, text);
    }
  };

  const handleSelectedCharsChange = (chars: string[]) => {
    setSelectedChars(chars);
    if (typeof window !== "undefined") {
      localStorage.setItem(`story_${storyId}_write_chars`, JSON.stringify(chars));
    }
  };
  
  const initialTaskId = searchParams.get("task_id");
  const taskType = searchParams.get("type");

  // Generation state
  const [generating, setGenerating] = useState(!!initialTaskId);
  const [taskId, setTaskId] = useState<string | null>(initialTaskId);
  const [taskStatus, setTaskStatus] = useState<string | null>(initialTaskId ? "running" : null);
  const [logs, setLogs] = useState<string[]>(initialTaskId ? ["Locating background loop execution state..."] : []);
  const [draft, setDraft] = useState("");
  const [scenePlan, setScenePlan] = useState<any[]>([]);
  
  const [approving, setApproving] = useState(false);

  const fetchWorkspace = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}`);
      const data = await res.json();
      setCharacters(data.characters || []);
    } catch (e) {
      console.error("Failed to load characters for checklist:", e);
    }
  };

  useEffect(() => {
    fetchWorkspace();
  }, [storyId]);

  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [logs]);

  // Task Polling Loop
  useEffect(() => {
    if (!taskId) return;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`http://127.0.0.1:8000/api/tasks/${taskId}`);
        const data = await res.json();
        
        setTaskStatus(data.status);
        setLogs(data.logs || []);
        setDraft(data.draft || "");
        setScenePlan(data.scene_plan || []);

        if (data.status === "completed" || data.status === "failed") {
          clearInterval(interval);
          setGenerating(false);
        }
      } catch (e) {
        console.error("Error polling task status:", e);
      }
    }, 1500);

    return () => clearInterval(interval);
  }, [taskId]);

  const handleStartGeneration = async () => {
    if (!outline.trim()) return;
    
    setGenerating(true);
    setTaskId(null);
    setLogs(["Task submitted. Waiting for backend schedule..."]);
    setDraft("");
    setScenePlan([]);
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/chapters/generate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chapter_no: chapterNo,
          arc_id: arcId,
          title: `Chapter ${chapterNo}: Generated Outline Draft`,
          outline: outline.trim(),
          selected_characters: selectedChars,
          selected_world_rules: selectedWorldRules,
          api_key_mode: "free"
        })
      });
      
      const data = await res.json();
      if (res.ok) {
        setTaskId(data.task_id);
        if (typeof window !== "undefined") {
          localStorage.removeItem(`story_${storyId}_write_outline`);
          localStorage.removeItem(`story_${storyId}_write_chars`);
        }
      } else {
        setLogs(prev => [...prev, `Error launching generation task: ${data.detail || "Server error"}`]);
        setGenerating(false);
      }
    } catch (e) {
      setLogs(prev => [...prev, `Error launching generation task: ${String(e)}`]);
      setGenerating(false);
    }
  };

  const handleApproveChapter = async () => {
    if (!taskId || approving) return;
    setApproving(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/tasks/${taskId}/approve`, {
        method: "POST"
      });
      if (res.ok) {
        alert("Chapter approved, memory layers compiled successfully!");
        router.push(`/stories/${storyId}`);
      } else {
        alert("Approval failed.");
      }
    } catch (e) {
      alert("Error approving chapter.");
    } finally {
      setApproving(false);
    }
  };

  const toggleCharSelection = (name: string) => {
    const nextChars = selectedChars.includes(name)
      ? selectedChars.filter(c => c !== name)
      : [...selectedChars, name];
    handleSelectedCharsChange(nextChars);
  };

  // Determine current active LangGraph phase for visual step trackers
  const getActivePhase = () => {
    if (!generating && !taskId) return "idle";
    if (taskStatus === "completed") return "done";
    if (taskStatus === "failed") return "failed";
    
    // Scan logs for indicators
    const logStr = logs.join("\n").toLowerCase();
    if (logStr.includes("self-correction")) return "correcting";
    if (logStr.includes("validation") || logStr.includes("fact checker")) return "validating";
    if (logStr.includes("composer")) return "composing";
    if (logStr.includes("writer") || logStr.includes("drafted")) return "writing";
    if (logStr.includes("planner")) return "planning";
    return "initializing";
  };

  const activePhase = getActivePhase();

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-6">
          <Link href={`/stories/${storyId}`} className="btn btn-secondary py-1.5 px-3 text-xs mb-3 inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Quay lại Không gian làm việc
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white">
            {taskType === "auto_write" ? "Bảng điều khiển Viết tự động Tuần tự" : "Trung tâm Soạn thảo Chương"}
          </h1>
          <p className="text-gray-400 mt-1 text-sm">
            {taskType === "auto_write"
              ? "Luồng soạn thảo tự động tuần tự đang hoạt động. Hệ thống sẽ tích lũy sự kiện, cập nhật và dữ kiện trong thời gian thực."
              : `Soạn thảo Chương ${chapterNo}. Phác thảo hướng đi của các cảnh, liên kết hồ sơ nhân vật và kích hoạt quy trình viết của AI.`}
          </p>
        </header>

        <section className="grid-cols-2 gap-8 items-start" style={{ display: 'grid', gridTemplateColumns: '400px 1fr' }}>
          
          {/* Controls Panel */}
          <div className="flex flex-col gap-6">
            {taskType !== "auto_write" ? (
              <div className="glass-card flex flex-col gap-4">
                <h2 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider">Cấu hình Chương {chapterNo}</h2>
                
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-400">Dàn ý chương / Hướng đi cảnh *</label>
                  <textarea 
                    className="form-textarea min-h-[140px]" 
                    placeholder="Ví dụ: Ren bí mật gặp Yuki trong phòng kho. Yuki hỏi về con dao bị giấu. Ren nói dối, nhưng Yuki tìm thấy chìa khóa..."
                    value={outline}
                    onChange={(e) => handleOutlineChange(e.target.value)}
                    disabled={generating}
                  />
                </div>

                {/* Characters Involved */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-400 flex items-center gap-1">
                    <Users size={14} /> Nhân vật tham gia
                  </label>
                  {characters.length === 0 ? (
                    <span className="text-xs text-gray-600">Chưa có nhân vật nào được lưu. Hãy quay lại trang hồ sơ để tạo.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-[120px] overflow-y-auto p-1 bg-black/10 rounded-lg">
                      {characters.map(c => {
                        const isSelected = selectedChars.includes(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCharSelection(c.name)}
                            disabled={generating}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border ${
                              isSelected 
                                ? "bg-indigo-500/10 border-indigo-500/30 text-white" 
                                : "bg-white/5 border-white/5 text-gray-400 hover:border-white/10"
                            }`}
                          >
                            {c.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>

                <button
                  onClick={handleStartGeneration}
                  className="btn btn-primary mt-2 w-full"
                  disabled={generating || !outline.trim()}
                >
                  <Sparkles size={16} />
                  <span>{generating ? "Đang viết chương..." : `Viết Chương ${chapterNo}`}</span>
                </button>
              </div>
            ) : (
              <div className="glass-card flex flex-col gap-4 border-indigo-500/20 bg-indigo-500/5">
                <h2 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider">Đang Chạy Luồng Viết Tự Động</h2>
                <p className="text-xs text-gray-300 leading-relaxed">
                  AI đang tiến hành viết các chương từ dàn ý. <strong>Mỗi chương sẽ được tự động lưu.</strong>
                </p>
                <div className="text-[10px] text-gray-500">
                  Bạn có thể đóng trang này hoặc chuyển hướng sang trang khác một cách an toàn; worker chạy nền sẽ tiếp tục viết cho đến khi hoàn tất.
                </div>
                {(taskStatus === "completed" || taskStatus === "failed") && (
                  <Link href={`/stories/${storyId}`} className="btn btn-primary mt-2 text-center w-full">
                    Quay lại Không gian làm việc
                  </Link>
                )}
              </div>
            )}

            {/* Visual Graph Progress Tracker */}
            {(generating || taskId) && (
              <div className="glass-card flex flex-col gap-4">
                <h3 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider">Trạng thái Agent LangGraph</h3>
                
                <div className="flex flex-col gap-4">
                  {[
                    { key: "initializing", label: "Xây dựng Gói ngữ cảnh", desc: "Tải các quy tắc văn phong & truy xuất sự kiện lịch sử" },
                    { key: "planning", label: "Lập kế hoạch Cảnh (Pro)", desc: "Phân chia dàn ý chương thành các cảnh chi tiết" },
                    { key: "writing", label: "Soạn thảo Cảnh (Pro)", desc: "Tiến hành viết nháp từng cảnh một cách tuần tự" },
                    { key: "composing", label: "Biên tập & Hợp nhất", desc: "Ghép nối các cảnh lại thành một bản văn truyện hoàn chỉnh" },
                    { key: "validating", label: "Đánh giá QA Độc lập (Flash)", desc: "Kiểm duyệt tính logic của câu chuyện và quy tắc văn phong" },
                    { key: "correcting", label: "Vòng lặp Tự sửa lỗi (Pro)", desc: "Viết lại các phần bị cảnh báo hoặc phát hiện lỗi bởi bộ đánh giá" }
                  ].map((step, idx) => {
                    const steps = ["initializing", "planning", "writing", "composing", "validating", "correcting"];
                    const currentIdx = steps.indexOf(activePhase);
                    const stepIdx = steps.indexOf(step.key);
                    
                    let statusColor = "border-white/5 text-gray-500";
                    let badge = null;
                    
                    if (activePhase === "done") {
                      statusColor = "border-emerald-500/30 text-emerald-400";
                    } else if (activePhase === "failed") {
                      statusColor = "border-red-500/30 text-red-400";
                    } else if (stepIdx < currentIdx) {
                      statusColor = "border-indigo-500/30 text-indigo-400";
                      badge = <Check size={14} className="text-indigo-400" />;
                    } else if (stepIdx === currentIdx) {
                      statusColor = "border-cyan-500/30 text-cyan-400 pulse-glow bg-cyan-500/5";
                    }
                    
                    return (
                      <div key={step.key} className={`p-3 rounded-xl border flex items-start gap-3 ${statusColor}`}>
                        <div className="w-5 h-5 rounded-full bg-black/30 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                          {badge || (idx + 1)}
                        </div>
                        <div>
                          <h4 className="font-bold text-xs">{step.label}</h4>
                          <p className="text-[10px] text-gray-500 mt-0.5 leading-relaxed">{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          {/* Terminal Console & Draft Preview */}
          <div className="flex flex-col gap-6">
            
            {/* Terminal Console */}
            {(generating || logs.length > 0) && (
              <div className="glass-card flex flex-col gap-3 bg-black/40">
                <h3 className="card-title text-sm font-semibold text-gray-400 flex items-center gap-1.5 font-mono">
                  <Terminal size={16} className="text-indigo-400" />
                  <span>Nhật ký của Engine LangGraph</span>
                </h3>
                <div ref={logContainerRef} className="font-mono text-xs text-gray-300 bg-black/30 p-4 rounded-xl border border-white/5 min-h-[200px] max-h-[250px] overflow-y-auto flex flex-col gap-1.5">
                  {logs.map((log, idx) => (
                    <div key={idx} className="leading-relaxed border-l-2 border-indigo-500/30 pl-2">
                      <span className="text-gray-600">[{new Date().toLocaleTimeString()}]</span> {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Generated Draft Preview */}
            <div className="glass-card flex flex-col gap-4 flex-1">
              <div className="flex justify-between items-center">
                <h2 className="card-title">
                  {taskType === "auto_write" ? "Trạng thái Thực thi Viết Tự động" : "Nội dung Bản nháp Chương"}
                </h2>
                {taskStatus === "completed" && taskType !== "auto_write" && (
                  <button 
                    onClick={handleApproveChapter} 
                    className="btn btn-primary py-2 px-6 flex items-center gap-1.5"
                    disabled={approving}
                  >
                    {approving ? "Đang lưu..." : "Phê duyệt & Lưu chương"}
                    <CheckCircle2 size={16} />
                  </button>
                )}
              </div>

              {taskType === "auto_write" ? (
                <div className="p-6 rounded-xl bg-black/20 border border-white/5 flex flex-col gap-4 min-h-[300px] text-xs font-mono text-gray-400">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2 text-gray-500 font-bold">
                    <span>Trạng thái Tác vụ:</span>
                    <span className={`badge ${
                      taskStatus === "completed" ? "badge-success" : taskStatus === "failed" ? "badge-danger" : "badge-warning"
                    }`}>{taskStatus === "completed" ? "Thành công" : taskStatus === "failed" ? "Thất bại" : "Đang chạy"}</span>
                  </div>
                  <div className="flex-1 flex flex-col gap-2 justify-center items-center py-12 text-center">
                    <Sparkles className={`text-indigo-400 mb-2 ${taskStatus === "running" ? "animate-spin" : ""}`} size={32} />
                    <p className="text-sm text-gray-300 font-bold">
                      {taskStatus === "completed" 
                        ? "🎉 Viết tất cả các chương thành công!" 
                        : taskStatus === "failed" 
                          ? "⚠️ Luồng viết tự động thất bại." 
                          : "Quy trình đang chạy tuần tự dưới nền..."}
                    </p>
                    <p className="text-[10px] text-gray-500 mt-1 max-w-sm">
                      Kiểm tra nhật ký thực thi thời gian thực bên dưới. Tất cả các bản nháp hoàn thành đều được lưu vào nhật ký chương viết của truyện.
                    </p>
                  </div>
                </div>
              ) : (
                draft ? (
                  <div className="p-6 rounded-xl bg-black/20 border border-white/5 max-h-[500px] overflow-y-auto leading-relaxed text-gray-300 font-serif text-lg whitespace-pre-wrap">
                    {draft}
                  </div>
                ) : (
                  <div className="text-center py-32 text-gray-600 border border-dashed border-white/5 rounded-xl">
                    {generating 
                      ? "Đang tạo bản thảo... Bản xem trước thời gian thực sẽ hiển thị tại đây khi từng cảnh viết xong."
                      : "Thiết lập cấu hình bên trái và nhấp vào Viết Chương để kích hoạt quy trình viết của AI."
                    }
                  </div>
                )
              )}
            </div>

          </div>
        </section>
      </main>
    </div>
  );
}

export default function WritingCenter() {
  return (
    <Suspense fallback={
      <div className="dashboard-container">
        <Navigation />
        <main className="main-content flex items-center justify-center">
          <div className="text-gray-400">Đang tải các công cụ viết truyện...</div>
        </main>
      </div>
    }>
      <WritingCenterContent />
    </Suspense>
  );
}

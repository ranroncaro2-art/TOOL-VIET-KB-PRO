"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { 
  ArrowLeft, BookOpen, Users, Globe, Edit3, ShieldAlert, 
  Sparkles, Save, Download, Plus, Key, Eye, HelpCircle, Archive, Coins,
  Loader2
} from "lucide-react";

interface Story {
  id: number;
  title: string;
  description: string;
  status: string;
  language: string;
  pov: string;
  style: string;
}

interface Chapter {
  id: number;
  chapter_no: number;
  title: string;
  content: string;
  created_at: string;
}

interface Character {
  id: number;
  name: string;
  appearance: string;
  personality: string;
  speaking_style: string;
  secret: string;
  version: number;
}

interface Arc {
  id: number;
  arc_no: number;
  name: string;
  goal: string;
  summary: string | null;
  status: string;
}

interface PlotThread {
  id: number;
  description: string;
  status: string;
}

interface LongTermFact {
  id: number;
  fact_text: string;
}

export default function StoryWorkspace() {
  const params = useParams();
  const router = useRouter();
  const storyId = params.id;

  const [activeTab, setActiveTab] = useState("chapters");
  const [story, setStory] = useState<Story | null>(null);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [arcs, setArcs] = useState<Arc[]>([]);
  const [threads, setThreads] = useState<PlotThread[]>([]);
  const [facts, setFacts] = useState<LongTermFact[]>([]);
  
  const [worldContent, setWorldContent] = useState("");
  const [styleContent, setStyleContent] = useState("");
  const [loading, setLoading] = useState(true);

  interface UsageLog {
    id: number;
    node_name: string;
    model_name: string;
    input_tokens: number;
    output_tokens: number;
    cached_input_tokens: number;
    estimated_cost: number;
    timestamp: string;
  }

  interface UsageSummary {
    total_cost: number;
    total_input_tokens: number;
    total_output_tokens: number;
    total_cached_tokens: number;
    caching_savings: number;
    logs: UsageLog[];
  }

  const [usageSummary, setUsageSummary] = useState<UsageSummary | null>(null);

  const fetchUsage = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/usage`);
      if (res.ok) {
        const data = await res.json();
        setUsageSummary(data);
      }
    } catch (e) {
      console.error("Error fetching usage summary:", e);
    }
  };

  useEffect(() => {
    if (activeTab === "usage") {
      fetchUsage();
    }
  }, [activeTab, storyId]);

  // Form states for adding characters
  const [showAddChar, setShowAddChar] = useState(false);
  const [charName, setCharName] = useState("");
  const [charAppearance, setCharAppearance] = useState("");
  const [charPersonality, setCharPersonality] = useState("");
  const [charSpeaking, setCharSpeaking] = useState("");
  const [charSecret, setCharSecret] = useState("");
  
  // Selected chapter for reading modal
  const [readingChapter, setReadingChapter] = useState<Chapter | null>(null);

  // Import Outline Modal States
  const [showImportOutline, setShowImportOutline] = useState(false);
  const [outlineText, setOutlineText] = useState("");
  const [importing, setImporting] = useState(false);

  // Active Background Task Detector
  const [hasActiveTask, setHasActiveTask] = useState(false);
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null);
  const [activeTaskType, setActiveTaskType] = useState<string | null>(null);

  const checkActiveTasks = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/queue");
      if (res.ok) {
        const queue = await res.json();
        const active = queue.find((t: any) => t.story_id === parseInt(String(storyId)) && (t.status === "running" || t.status === "pending"));
        if (active) {
          setHasActiveTask(true);
          setActiveTaskId(active.id);
          setActiveTaskType(active.type);
        } else {
          setHasActiveTask(false);
          setActiveTaskId(null);
          setActiveTaskType(null);
        }
      }
    } catch (e) {
      console.error("Failed to check active tasks:", e);
    }
  };

  useEffect(() => {
    checkActiveTasks();
    const interval = setInterval(checkActiveTasks, 3000);
    return () => clearInterval(interval);
  }, [storyId]);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem(`story_${storyId}_import_outline`);
      if (saved) setOutlineText(saved);
    }
  }, [storyId]);

  const handleOutlineTextChange = (text: string) => {
    setOutlineText(text);
    if (typeof window !== "undefined") {
      localStorage.setItem(`story_${storyId}_import_outline`, text);
    }
  };

  // Auto-Write Loop Modal States
  const [showAutoWrite, setShowAutoWrite] = useState(false);
  const [startChapterNo, setStartChapterNo] = useState(1);
  const [endChapterNo, setEndChapterNo] = useState(1);
  const [selectedCharsForAuto, setSelectedCharsForAuto] = useState<string[]>([]);
  const [autoWriting, setAutoWriting] = useState(false);

  const openAutoWriteModal = () => {
    const unwrittenChapters = chapters.filter(c => !c.content);
    const startNo = unwrittenChapters.length > 0 
      ? Math.min(...unwrittenChapters.map(c => c.chapter_no)) 
      : 1;
    const endNo = chapters.length > 0 
      ? Math.max(...chapters.map(c => c.chapter_no)) 
      : 1;
      
    setStartChapterNo(startNo);
    setEndChapterNo(endNo);
    setSelectedCharsForAuto(characters.map(c => c.name));
    setShowAutoWrite(true);
  };

  const toggleCharSelectionForAuto = (name: string) => {
    setSelectedCharsForAuto(prev => 
      prev.includes(name) ? prev.filter(c => c !== name) : [...prev, name]
    );
  };

  const handleStartAutoWrite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (startChapterNo > endChapterNo) {
      alert("Start chapter must be less than or equal to End chapter.");
      return;
    }

    setAutoWriting(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/auto-write`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start_chapter_no: startChapterNo,
          end_chapter_no: endChapterNo,
          selected_characters: selectedCharsForAuto,
          selected_world_rules: []
        })
      });

      if (res.ok) {
        const data = await res.json();
        setShowAutoWrite(false);
        router.push(`/stories/${storyId}/write?task_id=${data.task_id}&type=auto_write`);
      } else {
        const data = await res.json();
        alert(`Failed to start auto-write loop: ${data.detail || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error connecting to server.");
    } finally {
      setAutoWriting(false);
    }
  };

  const handleImportOutline = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!outlineText.trim()) return;

    setImporting(true);
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/import-outline`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          outline_text: outlineText.trim(),
          arc_id: activeArc?.id || null
        })
      });

      if (res.ok) {
        alert("Story outline imported successfully!");
        setShowImportOutline(false);
        setOutlineText("");
        if (typeof window !== "undefined") {
          localStorage.removeItem(`story_${storyId}_import_outline`);
        }
        fetchDetails(); // Refresh workspace
      } else {
        const data = await res.json();
        alert(`Failed to import outline: ${data.detail || "Unknown error"}`);
      }
    } catch (err) {
      alert("Error connecting to server.");
    } finally {
      setImporting(false);
    }
  };

  const fetchDetails = async () => {
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}`);
      if (!res.ok) {
        router.push("/");
        return;
      }
      const data = await res.json();
      setStory(data.story);
      setChapters(data.chapters);
      setCharacters(data.characters);
      setArcs(data.arcs);
      setThreads(data.plot_threads);
      setFacts(data.long_term_facts);
      setWorldContent(data.world_bible?.content || "");
      setStyleContent(data.style_bible?.content || "");
    } catch (e) {
      console.error("Error fetching story workspace data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDetails();
  }, [storyId]);

  const handleSaveWorld = async () => {
    try {
      await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/bibles/world`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: worldContent })
      });
      alert("World Bible updated successfully.");
    } catch (e) {
      alert("Failed to save World Bible.");
    }
  };

  const handleSaveStyle = async () => {
    try {
      await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/bibles/style`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: styleContent })
      });
      alert("Style Bible updated successfully.");
    } catch (e) {
      alert("Failed to save Style Bible.");
    }
  };

  const handleAddCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!charName.trim()) return;

    try {
      const res = await fetch(`http://127.0.0.1:8000/api/stories/${storyId}/characters`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: charName.trim(),
          appearance: charAppearance.trim(),
          personality: charPersonality.trim(),
          speaking_style: charSpeaking.trim(),
          secret: charSecret.trim()
        })
      });

      if (res.ok) {
        setCharName("");
        setCharAppearance("");
        setCharPersonality("");
        setCharSpeaking("");
        setCharSecret("");
        setShowAddChar(false);
        fetchDetails();
      }
    } catch (e) {
      alert("Failed to create character profile.");
    }
  };

  if (loading) {
    return (
      <div className="dashboard-container">
        <Navigation />
        <main className="main-content flex items-center justify-center">
          <div className="text-gray-400">Loading story workspace details...</div>
        </main>
      </div>
    );
  }

  const nextChapterNo = chapters.length > 0 ? (Math.max(...chapters.map(c => c.chapter_no)) + 1) : 1;
  const activeArc = arcs.find(a => a.status === "active") || arcs[0];

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-6 flex justify-between items-start">
          <div>
            <Link href="/" className="btn btn-secondary py-1.5 px-3 text-xs mb-3 inline-flex items-center gap-1">
              <ArrowLeft size={14} /> Quay lại
            </Link>
            <div className="flex items-center gap-3">
              <h1 className="text-3xl font-bold tracking-tight text-white">{story?.title}</h1>
              <span className="badge badge-info text-xs uppercase">{story?.language}</span>
            </div>
            <p className="text-gray-400 mt-1 text-sm max-w-xl">{story?.description || "Chưa có tóm tắt cốt truyện."}</p>
          </div>
          
          <div className="flex items-center gap-2">
            {/* Export dropdown */}
            <div className="relative group">
              <button className="btn btn-secondary py-2 px-3 flex items-center gap-1">
                <Download size={16} />
                <span>Xuất Tác Phẩm</span>
              </button>
              <div className="absolute right-0 top-full mt-1 hidden group-hover:block bg-slate-900 border border-white/5 rounded-lg shadow-xl overflow-hidden z-50 min-w-[120px]">
                <a href={`http://127.0.0.1:8000/api/stories/${storyId}/export?format=txt`} className="block px-4 py-2 text-xs text-gray-300 hover:bg-white/5">Văn bản thuần (.TXT)</a>
                <a href={`http://127.0.0.1:8000/api/stories/${storyId}/export?format=docx`} className="block px-4 py-2 text-xs text-gray-300 hover:bg-white/5">Tài liệu Word (.DOCX)</a>
                <a href={`http://127.0.0.1:8000/api/stories/${storyId}/export?format=pdf`} className="block px-4 py-2 text-xs text-gray-300 hover:bg-white/5">Tài liệu PDF (.PDF)</a>
              </div>
            </div>

            <button 
              onClick={() => !hasActiveTask && setShowImportOutline(true)} 
              disabled={hasActiveTask}
              className={`btn btn-secondary py-2 px-3 flex items-center gap-1 ${hasActiveTask ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Plus size={16} />
              <span>Nhập Dàn Ý</span>
            </button>

            <button 
              onClick={() => !hasActiveTask && openAutoWriteModal()} 
              disabled={hasActiveTask}
              className={`btn btn-secondary border-indigo-500/30 text-[#a78bfa] hover:text-white hover:bg-white/5 py-2 px-3 flex items-center gap-1 ${hasActiveTask ? 'opacity-40 cursor-not-allowed' : ''}`}
            >
              <Sparkles size={16} />
              <span>Viết Tự Động</span>
            </button>

            {hasActiveTask ? (
              <button 
                disabled 
                className="btn btn-primary opacity-40 cursor-not-allowed flex items-center gap-1"
              >
                <Loader2 size={16} className="animate-spin" />
                <span>Đang chạy tác vụ...</span>
              </button>
            ) : (
              <Link href={`/stories/${storyId}/write?chapter_no=${nextChapterNo}&arc_id=${activeArc?.id}`} className="btn btn-primary">
                <Sparkles size={16} />
                <span>Soạn Chương {nextChapterNo}</span>
              </Link>
            )}
          </div>
        </header>

        {/* Active task alert banner */}
        {hasActiveTask && (
          <div className="mb-6 p-4 rounded-xl border border-indigo-500/20 bg-indigo-500/5 flex items-center justify-between">
            <div className="flex items-center gap-3 text-sm">
              <span className="relative flex h-3 w-3 shrink-0">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-3 w-3 bg-indigo-500"></span>
              </span>
              <span className="text-gray-300">
                Một tác vụ chạy nền đang thực hiện <strong>{activeTaskType === 'auto_write' ? 'Auto-Write Loop' : 'Soạn thảo Chương'}</strong> cho câu chuyện này.
              </span>
            </div>
            <Link 
              href={`/stories/${storyId}/write?task_id=${activeTaskId}&type=${activeTaskType}`}
              className="btn btn-primary py-1.5 px-4 text-xs font-semibold"
            >
              Mở Console
            </Link>
          </div>
        )}

        {/* Tab Headers */}
        <section className="flex bg-[#0a0c16] border border-white/5 p-1 rounded-xl mb-6 gap-1 overflow-x-auto">
          {[
            { id: "chapters", label: "Danh sách chương", icon: BookOpen },
            { id: "characters", label: "Hồ sơ nhân vật", icon: Users },
            { id: "world", label: "Thiết lập thế giới", icon: Globe },
            { id: "style", label: "Quy tắc văn phong", icon: Edit3 },
            { id: "memory", label: "Trí nhớ & Tuyến truyện", icon: Archive },
            { id: "usage", label: "Thống kê chi phí", icon: Coins }
          ].map(t => {
            const Icon = t.icon;
            const isTabActive = activeTab === t.id;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id)}
                className={`py-2 px-4 flex items-center gap-2 font-semibold text-xs rounded-lg transition-all ${
                  isTabActive 
                    ? "bg-[#8b5cf6]/10 text-[#a78bfa] border border-[#8b5cf6]/20 shadow-md" 
                    : "border border-transparent text-gray-400 hover:text-white hover:bg-white/5"
                }`}
              >
                <Icon size={16} />
                <span>{t.label}</span>
              </button>
            );
          })}
        </section>

        {/* Tab Body */}
        <div className="min-h-[400px]">
          
          {/* TABS: CHAPTERS */}
          {activeTab === "chapters" && (
            <div className="glass-card">
              <h2 className="card-title mb-4">Nhật ký chương viết ({chapters.length})</h2>
              {chapters.length === 0 ? (
                <div className="text-center py-16 text-gray-500 border border-dashed border-white/5 rounded-xl">
                  <p>Chưa có chương nào được viết cho truyện này.</p>
                  <p className="text-xs text-gray-600 mt-1">Nhấp vào nút ở góc trên bên phải để bắt đầu viết Chương 1!</p>
                </div>
              ) : (
                <div className="grid-cols-2 gap-4">
                  {chapters.map(c => (
                    <div key={c.id} className="p-4 rounded-xl bg-white/5 border border-white/5 flex items-center justify-between hover:border-indigo-500/20">
                      <div>
                        <span className="text-indigo-400 text-xs font-bold uppercase">Chương {c.chapter_no}</span>
                        <h3 className="text-md font-bold text-white mt-1">{c.title}</h3>
                        <p className="text-[10px] text-gray-500 mt-1">Đã viết lúc: {new Date(c.created_at).toLocaleDateString()}</p>
                      </div>
                      <button onClick={() => setReadingChapter(c)} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                        <Eye size={12} />
                        <span>Đọc bản nháp</span>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TABS: CHARACTERS */}
          {activeTab === "characters" && (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <h2 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider">Danh sách nhân vật ({characters.length})</h2>
                <button onClick={() => setShowAddChar(!showAddChar)} className="btn btn-secondary py-1.5 px-3 text-xs flex items-center gap-1">
                  <Plus size={14} /> Thêm nhân vật
                </button>
              </div>

              {showAddChar && (
                <form onSubmit={handleAddCharacter} className="glass-card grid-cols-2 gap-6 items-start">
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-gray-400">Tên nhân vật *</label>
                      <input type="text" className="form-input" placeholder="Takahashi Ren" value={charName} onChange={(e) => setCharName(e.target.value)} required />
                      {story?.language === 'ja' && <span className="text-[10px] text-gray-500">Lưu ý: Tên phiên âm Latinh sẽ tự động chuyển đổi sang chữ Hán Nhật khi lưu.</span>}
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-gray-400">Chi tiết ngoại hình</label>
                      <textarea className="form-textarea min-h-[80px]" placeholder="17 tuổi, tóc đen, đôi mắt trầm lặng..." value={charAppearance} onChange={(e) => setCharAppearance(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-gray-400">Bí mật nhân vật (Quan trọng cho cốt truyện đột phá)</label>
                      <input type="text" className="form-input" placeholder="Sở hữu một chiếc chìa khóa bí mật trong kho thể chất..." value={charSecret} onChange={(e) => setCharSecret(e.target.value)} />
                    </div>
                  </div>
                  <div className="flex flex-col gap-4">
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-gray-400">Tính cách</label>
                      <textarea className="form-textarea min-h-[80px]" placeholder="Lạnh lùng, khép kín, cực kỳ thông minh..." value={charPersonality} onChange={(e) => setCharPersonality(e.target.value)} />
                    </div>
                    <div className="flex flex-col gap-2">
                      <label className="text-xs font-bold text-gray-400">Phong cách nói / Thói quen ngôn từ</label>
                      <input type="text" className="form-input" placeholder="Nói những câu ngắn gọn, mang tính khẳng định..." value={charSpeaking} onChange={(e) => setCharSpeaking(e.target.value)} />
                    </div>
                    <button type="submit" className="btn btn-primary mt-2">Lưu hồ sơ</button>
                  </div>
                </form>
              )}

              {characters.length === 0 ? (
                <div className="text-center py-12 text-gray-500 border border-dashed border-white/5 rounded-xl">
                  Chưa có nhân vật nào được lưu.
                </div>
              ) : (
                <div className="grid-cols-2 gap-6">
                  {characters.map(char => (
                    <div key={char.id} className="glass-card flex flex-col gap-3">
                      <div className="flex justify-between items-start">
                        <h3 className="text-lg font-bold text-white">{char.name}</h3>
                        <span className="badge badge-info text-[9px]">V{char.version}</span>
                      </div>
                      <div className="text-xs flex flex-col gap-2 text-gray-300">
                        <div><strong className="text-gray-500">Ngoại hình:</strong> {char.appearance || "Chưa cập nhật"}</div>
                        <div><strong className="text-gray-500">Tính cách:</strong> {char.personality || "Chưa cập nhật"}</div>
                        <div><strong className="text-gray-500">Văn phong nói:</strong> {char.speaking_style || "Chưa cập nhật"}</div>
                        {char.secret && <div className="p-2 rounded bg-red-500/5 border border-red-500/10 text-red-400"><strong className="text-red-500">Bí mật:</strong> {char.secret}</div>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TABS: WORLD BIBLE */}
          {activeTab === "world" && (
            <div className="glass-card flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="card-title">Tài liệu Thiết lập thế giới (World Bible)</h2>
                  <p className="text-xs text-gray-500">Định nghĩa hệ thống sức mạnh, sự kiện dòng thời gian hoặc thiết lập địa điểm. Các cập nhật sẽ được lưu cache.</p>
                </div>
                <button onClick={handleSaveWorld} className="btn btn-primary py-2 px-4">
                  <Save size={16} />
                  <span>Lưu thiết lập thế giới</span>
                </button>
              </div>
              <textarea 
                className="form-textarea font-mono text-sm leading-relaxed min-h-[400px]" 
                value={worldContent} 
                onChange={(e) => setWorldContent(e.target.value)} 
              />
            </div>
          )}

          {/* TABS: STYLE BIBLE */}
          {activeTab === "style" && (
            <div className="glass-card flex flex-col gap-4">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="card-title">Tài liệu Quy tắc văn phong (Style Bible)</h2>
                  <p className="text-xs text-gray-500">Định nghĩa ngôi kể, quy tắc kịch tính cuối chương hoặc định dạng đối thoại để giữ nhịp truyện.</p>
                </div>
                <button onClick={handleSaveStyle} className="btn btn-primary py-2 px-4">
                  <Save size={16} />
                  <span>Lưu quy tắc văn phong</span>
                </button>
              </div>
              <textarea 
                className="form-textarea font-mono text-sm leading-relaxed min-h-[400px]" 
                value={styleContent} 
                onChange={(e) => setStyleContent(e.target.value)} 
              />
            </div>
          )}

          {/* TABS: MEMORY & ARCS */}
          {activeTab === "memory" && (
            <div className="grid-cols-3 gap-6" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr' }}>
              
              {/* Arcs Recap */}
              <div className="glass-card flex flex-col gap-4">
                <h3 className="card-title text-sm uppercase tracking-wider text-indigo-400">Tóm tắt Arc cốt truyện</h3>
                {arcs.map(arc => (
                  <div key={arc.id} className="p-3 rounded-lg bg-white/5 border border-white/5 text-xs">
                    <div className="flex justify-between mb-1">
                      <span className="font-bold text-gray-300">Arc {arc.arc_no}: {arc.name}</span>
                      <span className={`badge ${arc.status === 'active' ? 'badge-success' : 'badge-danger'} scale-90`}>{arc.status === 'active' ? 'Hoạt động' : arc.status}</span>
                    </div>
                    <p className="text-gray-500 mt-1"><strong className="text-gray-400">Mục tiêu:</strong> {arc.goal}</p>
                    {arc.summary && (
                      <p className="text-[10px] text-gray-400 mt-3 pt-2 border-t border-white/5 leading-relaxed bg-black/10 p-2 rounded">
                        <strong>Tóm tắt tổng quan:</strong><br />{arc.summary}
                      </p>
                    )}
                  </div>
                ))}
              </div>

              {/* Long Term Facts */}
              <div className="glass-card flex flex-col gap-4">
                <h3 className="card-title text-sm uppercase tracking-wider text-indigo-400">Sự kiện dài hạn ({facts.length})</h3>
                {facts.length === 0 ? (
                  <p className="text-xs text-gray-500">Chưa ghi nhận sự kiện dài hạn nào. Hệ thống sẽ tự động thêm sau khi phê duyệt chương.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {facts.map(fact => (
                      <div key={fact.id} className="p-2 rounded bg-white/5 border border-white/5 text-xs text-gray-300">
                        {fact.fact_text}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Plot Threads */}
              <div className="glass-card flex flex-col gap-4">
                <h3 className="card-title text-sm uppercase tracking-wider text-indigo-400">Tuyến cốt truyện phụ ({threads.length})</h3>
                {threads.length === 0 ? (
                  <p className="text-xs text-gray-500">Chưa có tuyến cốt truyện phụ nào. Hệ thống sẽ tự động trích xuất.</p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {threads.map(t => (
                      <div key={t.id} className="p-2.5 rounded bg-white/5 border border-white/5 text-xs flex justify-between items-start gap-2">
                        <span className="text-gray-300">{t.description}</span>
                        <span className={`badge ${t.status === 'open' ? 'badge-warning' : 'badge-success'} scale-75`}>{t.status === 'open' ? 'Đang mở' : 'Đóng'}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>

            </div>
          )}

          {/* TABS: USAGE & COST */}
          {activeTab === "usage" && (
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-center">
                <div>
                  <h2 className="card-title text-indigo-400 font-bold uppercase text-xs tracking-wider">Phân tích Token & Chi phí</h2>
                  <p className="text-xs text-gray-500">Phân tích thời gian thực về lượng sử dụng API và tối ưu hóa bộ nhớ đệm cache.</p>
                </div>
                <button onClick={fetchUsage} className="btn btn-secondary py-1.5 px-3 text-xs">
                  Làm mới thống kê
                </button>
              </div>

              {usageSummary ? (
                <>
                  {/* Summary Grid */}
                  <div className="grid grid-cols-4 gap-4" style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)' }}>
                    <div className="glass-card p-4 flex flex-col gap-1 border-white/5 bg-slate-900/60">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Tổng chi phí (USD)</span>
                      <span className="text-2xl font-black text-white">${usageSummary.total_cost.toFixed(5)}</span>
                      <span className="text-[9px] text-gray-400 mt-1">Dựa trên đơn giá mô hình Gemini</span>
                    </div>
                    <div className="glass-card p-4 flex flex-col gap-1 border-white/5 bg-slate-900/60">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Token đã xử lý</span>
                      <span className="text-2xl font-black text-white">{(usageSummary.total_input_tokens + usageSummary.total_output_tokens).toLocaleString()}</span>
                      <span className="text-[9px] text-gray-400 mt-1">Đầu vào: {usageSummary.total_input_tokens.toLocaleString()} | Đầu ra: {usageSummary.total_output_tokens.toLocaleString()}</span>
                    </div>
                    <div className="glass-card p-4 flex flex-col gap-1 border-white/5 bg-slate-900/60">
                      <span className="text-[10px] text-gray-500 font-bold uppercase tracking-wider">Token đầu vào đã cache</span>
                      <span className="text-2xl font-black text-indigo-400">{usageSummary.total_cached_tokens.toLocaleString()}</span>
                      <span className="text-[9px] text-indigo-500/80 mt-1">
                        Tỷ lệ trúng Cache: {usageSummary.total_input_tokens > 0 
                          ? ((usageSummary.total_cached_tokens / (usageSummary.total_input_tokens + usageSummary.total_cached_tokens)) * 100).toFixed(1) 
                          : "0.0"}%
                      </span>
                    </div>
                    <div className="glass-card p-4 flex flex-col gap-1 border-indigo-500/20 bg-indigo-500/5">
                      <span className="text-[10px] text-emerald-400 font-bold uppercase tracking-wider">Tiết kiệm ước tính</span>
                      <span className="text-2xl font-black text-emerald-400">${usageSummary.caching_savings.toFixed(5)}</span>
                      <span className="text-[9px] text-emerald-500 mt-1">Tiết kiệm được nhờ context caching</span>
                    </div>
                  </div>

                  {/* Execution Logs Table */}
                  <div className="glass-card p-5">
                    <h3 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">Lịch sử thực thi các Node Agent</h3>
                    {usageSummary.logs.length === 0 ? (
                      <div className="text-center py-12 text-gray-500 text-xs">
                        Chưa ghi nhận lượt chạy mô hình nào. Viết chương để bắt đầu tạo thống kê.
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs border-collapse">
                          <thead>
                            <tr className="border-b border-white/5 text-gray-500 uppercase tracking-wider font-bold">
                              <th className="py-3 px-2">Thời gian</th>
                              <th className="py-3 px-2">Node Agent</th>
                              <th className="py-3 px-2">Mô hình</th>
                              <th className="py-3 px-2 text-right">Token đầu vào</th>
                              <th className="py-3 px-2 text-right text-indigo-400">Đầu vào đã Cache</th>
                              <th className="py-3 px-2 text-right text-orange-400">Token đầu ra</th>
                              <th className="py-3 px-2 text-right">Chi phí (USD)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {usageSummary.logs.map((log) => {
                              const isPro = log.model_name.toLowerCase().includes("pro");
                              return (
                                <tr key={log.id} className="border-b border-white/5 hover:bg-white/5 transition-colors">
                                  <td className="py-3 px-2 text-gray-400">
                                    {new Date(log.timestamp).toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 font-bold text-white">
                                    <span className="px-2 py-0.5 rounded bg-white/5 border border-white/10">
                                      {log.node_name || "LLM Call"}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2">
                                    <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                      isPro 
                                        ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" 
                                        : "bg-cyan-500/10 text-cyan-400 border border-cyan-500/20"
                                    }`}>
                                      {log.model_name}
                                    </span>
                                  </td>
                                  <td className="py-3 px-2 text-right text-gray-300 font-mono">
                                    {log.input_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 text-right text-indigo-400 font-mono">
                                    {log.cached_input_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 text-right text-orange-400 font-mono">
                                    {log.output_tokens.toLocaleString()}
                                  </td>
                                  <td className="py-3 px-2 text-right text-emerald-400 font-bold font-mono">
                                    ${log.estimated_cost.toFixed(5)}
                                  </td>
                                </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="text-center py-12 text-gray-500">
                  Đang tải thông số thống kê sử dụng...
                </div>
              )}
            </div>
          )}

        </div>

        {/* READING MODAL */}
        {readingChapter && (
          <div className="fixed inset-0 bg-black/80 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-4xl max-h-[85vh] flex flex-col shadow-2xl">
              <header className="p-6 border-b border-white/5 flex justify-between items-center">
                <div>
                  <span className="text-indigo-400 text-xs font-bold uppercase">Chương {readingChapter.chapter_no}</span>
                  <h3 className="text-xl font-bold text-white mt-1">{readingChapter.title}</h3>
                </div>
                <button onClick={() => setReadingChapter(null)} className="btn btn-secondary py-1 px-3 text-xs">Đóng</button>
              </header>
              <div className="p-8 overflow-y-auto flex-1 text-gray-300 leading-relaxed font-serif text-lg whitespace-pre-wrap">
                {readingChapter.content}
              </div>
            </div>
          </div>
        )}

        {/* IMPORT OUTLINE MODAL */}
        {showImportOutline && (
          <div className="fixed inset-0 bg-black/80 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
              <header className="p-6 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Nhập Dàn ý Văn bản thuần</h3>
                  <p className="text-xs text-gray-400 mt-1">Dán cấu trúc dàn ý nhiều chương của bạn vào bên dưới bằng cách sử dụng các thẻ định nghĩa.</p>
                </div>
                <button onClick={() => setShowImportOutline(false)} className="btn btn-secondary py-1 px-3 text-xs">Hủy</button>
              </header>
              <form onSubmit={handleImportOutline} className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
                <div className="text-xs bg-slate-950/80 p-4 rounded-xl border border-white/5 text-gray-400 flex flex-col gap-1.5 leading-relaxed">
                  <strong className="text-indigo-400">Định dạng thẻ bắt buộc:</strong>
                  <div>• <code>[CHƯƠNG: X]</code> - Bắt đầu một chương mới</div>
                  <div>• <code>[TIÊU_ĐỀ: Tiêu đề chương]</code> - Tiêu đề chương</div>
                  <div>• <code>[TARGET: WordCount]</code> - Số từ mục tiêu của chương</div>
                  <div>• <code>[CẢNH: Y]</code> - Bắt đầu một cảnh</div>
                  <div>• Bao bọc nội dung cảnh bằng <code>[BẮT_ĐẦU_NỘI_DUNG]</code> và <code>[KẾT_THÚC_NỘI_DUNG]</code></div>
                </div>

                <textarea
                  className="form-textarea font-mono text-xs leading-relaxed flex-1 min-h-[300px] bg-slate-950/50"
                  placeholder={`[CHƯƠNG: 1]
[TIÊU_ĐỀ: HOOK – ĐÊM ĐẦU TIÊN]
[TARGET: 3000]

[CẢNH: 1]
[BẮT_ĐẦU_NỘI_DUNG]
* (01:37 sáng – mở đầu hành động)
* Bố nhận thông báo camera
* Mở điện thoại → thấy người trong phòng khách
[KẾT_THÚC_NỘI_DUNG]`}
                  value={outlineText}
                  onChange={(e) => handleOutlineTextChange(e.target.value)}
                  required
                />

                <button type="submit" className="btn btn-primary w-full py-3 mt-2" disabled={importing}>
                  {importing ? "Đang phân tích & Nhập..." : "Phân tích & Nhập dàn ý"}
                </button>
              </form>
            </div>
          </div>
        )}

        {/* AUTO-WRITE LOOP MODAL */}
        {showAutoWrite && (
          <div className="fixed inset-0 bg-black/80 backdrop-filter backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-slate-900 border border-white/10 rounded-2xl w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl">
              <header className="p-6 border-b border-white/5 flex justify-between items-center">
                <div>
                  <h3 className="text-xl font-bold text-white">Luồng Viết tự động Tuần tự</h3>
                  <p className="text-xs text-gray-400 mt-1">Cấu hình phạm vi và thông số để chạy luồng soạn thảo tự động.</p>
                </div>
                <button onClick={() => setShowAutoWrite(false)} className="btn btn-secondary py-1 px-3 text-xs">Hủy</button>
              </header>
              <form onSubmit={handleStartAutoWrite} className="p-6 flex-1 flex flex-col gap-4 overflow-y-auto">
                <div className="grid grid-cols-2 gap-4">
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400">Chương bắt đầu</label>
                    <input 
                      type="number" 
                      className="form-input bg-slate-950/50" 
                      value={startChapterNo} 
                      onChange={(e) => setStartChapterNo(parseInt(e.target.value) || 1)} 
                      min={1} 
                      required 
                    />
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-bold text-gray-400">Chương kết thúc</label>
                    <input 
                      type="number" 
                      className="form-input bg-slate-950/50" 
                      value={endChapterNo} 
                      onChange={(e) => setEndChapterNo(parseInt(e.target.value) || 1)} 
                      min={1} 
                      required 
                    />
                  </div>
                </div>

                {/* Active Characters checklist */}
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-bold text-gray-400">Bao gồm nhân vật trong bản thảo</label>
                  {characters.length === 0 ? (
                    <span className="text-xs text-gray-600">Chưa có nhân vật nào được lưu.</span>
                  ) : (
                    <div className="flex flex-wrap gap-2 max-h-[150px] overflow-y-auto p-2 bg-black/20 rounded-xl border border-white/5">
                      {characters.map(c => {
                        const isSelected = selectedCharsForAuto.includes(c.name);
                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => toggleCharSelectionForAuto(c.name)}
                            className={`py-1.5 px-3 rounded-lg text-xs font-semibold border ${
                              isSelected 
                                ? "bg-[#8b5cf6]/10 border-[#8b5cf6]/30 text-[#a78bfa]" 
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

                <div className="text-xs bg-indigo-500/5 p-4 rounded-xl border border-indigo-500/10 text-gray-400 leading-relaxed mt-2">
                  <strong className="text-indigo-400">Cơ chế hoạt động:</strong>
                  <div>• Soạn thảo và tích lũy trí nhớ tuần tự từ chương {startChapterNo} đến {endChapterNo}.</div>
                  <div>• Tự động phê duyệt, kiểm tra phong cách và cập nhật trí nhớ dài hạn giữa các chương.</div>
                </div>

                <button type="submit" className="btn btn-primary w-full py-3 mt-2" disabled={autoWriting}>
                  {autoWriting ? "Đang khởi tạo luồng..." : "Bắt đầu Viết tự động"}
                </button>
              </form>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

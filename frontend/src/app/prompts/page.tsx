"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { Terminal, Save, RotateCcw, HelpCircle, Layers, FileText, AlertTriangle, ShieldCheck } from "lucide-react";

interface Prompt {
  id: number;
  name: string;
  language: string;
  category: string;
  is_cacheable: boolean;
  priority: number;
  content: string;
  created_at: string;
}

interface PromptVersion {
  id: number;
  version: number;
  content: string;
  created_at: string;
}

interface Preset {
  id: number;
  name: string;
  description: string;
  variables: Record<string, string>;
}

export default function PromptsPage() {
  const [prompts, setPrompts] = useState<Prompt[]>([]);
  const [selectedPrompt, setSelectedPrompt] = useState<Prompt | null>(null);
  const [editorContent, setEditorContent] = useState("");
  const [promptCategory, setPromptCategory] = useState("Style");
  const [isCacheable, setIsCacheable] = useState(false);
  const [priority, setPriority] = useState(10);
  
  const [versions, setVersions] = useState<PromptVersion[]>([]);
  const [presets, setPresets] = useState<Preset[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchInitialData = async () => {
    try {
      const resP = await fetch("http://127.0.0.1:8000/api/prompts");
      const dataP = await resP.json();
      setPrompts(dataP);
      if (dataP.length > 0) {
        handleSelectPrompt(dataP[0]);
      }

      const resPres = await fetch("http://127.0.0.1:8000/api/presets");
      const dataPres = await resPres.json();
      setPresets(dataPres);
    } catch (e) {
      console.error("Failed to load prompts data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchInitialData();
  }, []);

  const handleSelectPrompt = async (prompt: Prompt) => {
    setSelectedPrompt(prompt);
    setEditorContent(prompt.content);
    setPromptCategory(prompt.category || "Style");
    setIsCacheable(prompt.is_cacheable !== undefined ? prompt.is_cacheable : false);
    setPriority(prompt.priority !== undefined ? prompt.priority : 10);
    
    // Fetch versions
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/prompts/${prompt.id}/versions`);
      const data = await res.json();
      setVersions(data);
    } catch (e) {
      console.error("Failed to load versions:", e);
    }
  };

  const handleSave = async () => {
    if (!selectedPrompt) return;
    if (selectedPrompt.category === "System") {
      alert("Prompt hệ thống được cố định và không thể sửa đổi.");
      return;
    }
    
    try {
      const res = await fetch("http://127.0.0.1:8000/api/prompts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: selectedPrompt.name,
          language: selectedPrompt.language,
          category: promptCategory,
          is_cacheable: isCacheable,
          priority: priority,
          content: editorContent
        })
      });
      
      if (res.ok) {
        alert("Lưu phiên bản prompt thành công!");
        const resP = await fetch("http://127.0.0.1:8000/api/prompts");
        const dataP = await resP.json();
        setPrompts(dataP);
        const updated = dataP.find((p: Prompt) => p.id === selectedPrompt.id);
        if (updated) {
          handleSelectPrompt(updated);
        }
      } else {
        const err = await res.json();
        alert(err.detail || "Không thể lưu phiên bản prompt");
      }
    } catch (e) {
      alert("Không thể lưu phiên bản prompt.");
    }
  };

  const handleRestore = async (versionNo: number) => {
    if (!selectedPrompt) return;
    if (selectedPrompt.category === "System") {
      alert("Prompt hệ thống được cố định và không thể sửa đổi.");
      return;
    }
    
    if (!confirm(`Bạn có chắc chắn muốn khôi phục Phiên bản ${versionNo}?`)) return;
    
    try {
      const res = await fetch(`http://127.0.0.1:8000/api/prompts/${selectedPrompt.id}/restore?version_no=${versionNo}`, {
        method: "POST"
      });
      if (res.ok) {
        alert(`Đã khôi phục Phiên bản ${versionNo}!`);
        const resP = await fetch("http://127.0.0.1:8000/api/prompts");
        const dataP = await resP.json();
        setPrompts(dataP);
        const updated = dataP.find((p: Prompt) => p.id === selectedPrompt.id);
        if (updated) {
          handleSelectPrompt(updated);
        }
      }
    } catch (e) {
      alert("Không thể khôi phục phiên bản.");
    }
  };

  const isSystem = selectedPrompt?.category === "System";

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Quản lý Prompt</h1>
          <p className="text-gray-400 mt-1">Cấu hình động các prompt, biểu mẫu mẫu, lịch sử phiên bản và cấu hình viết trước.</p>
        </header>

        <div className="grid-cols-3 gap-8 items-start" style={{ display: 'grid', gridTemplateColumns: '260px 1fr 320px' }}>
          
          {/* List of Prompts */}
          <div className="glass-card flex flex-col gap-4">
            <h2 className="card-title text-sm uppercase tracking-wider text-indigo-400">Danh sách Prompt</h2>
            {loading ? (
              <div className="text-gray-500 text-xs">Đang tải...</div>
            ) : (
              <div className="flex flex-col gap-2">
                {prompts.map((p) => (
                  <button 
                    key={p.id}
                    onClick={() => handleSelectPrompt(p)}
                    className={`text-left p-3 rounded-lg text-xs font-semibold flex flex-col gap-1 border ${
                      selectedPrompt?.id === p.id 
                        ? "bg-indigo-500/10 border-indigo-500/30 text-white" 
                        : "bg-white/5 border-white/5 text-gray-400 hover:border-white/10"
                    }`}
                  >
                    <div className="flex justify-between w-full items-center">
                      <span className="font-bold truncate max-w-[120px]">{p.name}</span>
                      <span className="badge badge-info text-[8px] scale-90">{p.language}</span>
                    </div>
                    <span className="text-[10px] text-gray-500">Danh mục: {p.category === 'System' ? 'Hệ thống' : p.category === 'Format' ? 'Định dạng' : p.category === 'Style' ? 'Văn phong' : p.category}</span>
                  </button>
                ))}
              </div>
            )}
            
            {/* Presets List */}
            <div className="mt-6 border-t border-white/5 pt-4">
              <h2 className="card-title text-sm uppercase tracking-wider text-indigo-400 mb-3 flex items-center gap-1">
                <Layers size={14} /> Các biến cấu hình sẵn
              </h2>
              <div className="flex flex-col gap-2">
                {presets.map((pr) => (
                  <div key={pr.id} className="p-3 rounded-lg bg-white/5 border border-white/5 text-xs">
                    <h4 className="font-bold text-gray-300">{pr.name}</h4>
                    <p className="text-gray-500 text-[10px] mt-1">{pr.description}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Edit Box */}
          <div className="glass-card flex flex-col gap-4">
            {selectedPrompt ? (
              <>
                <div className="flex justify-between items-center">
                  <div>
                    <h2 className="card-title">{selectedPrompt.name}</h2>
                    <span className="text-xs text-indigo-400">Ngôn ngữ: {selectedPrompt.language}</span>
                  </div>
                  <button 
                    onClick={handleSave} 
                    className="btn btn-primary py-2 px-4"
                    disabled={isSystem}
                  >
                    <Save size={16} />
                    <span>Lưu phiên bản mới</span>
                  </button>
                </div>

                {isSystem && (
                  <div className="p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex gap-2">
                    <AlertTriangle size={18} className="shrink-0" />
                    <div>
                      <h5 className="font-bold">Đang kích hoạt Bảo vệ Hệ thống</h5>
                      <p className="mt-0.5 leading-relaxed text-red-400/80">Prompt này được định cấu hình làm Prompt hệ thống cốt lõi và ở chế độ chỉ đọc để duy trì tính nhất quán hệ thống.</p>
                    </div>
                  </div>
                )}

                {/* Configurations grid */}
                <div className="grid-cols-3 gap-4" style={{ display: 'grid', gridTemplateColumns: '1fr 100px 120px' }}>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400">Danh mục</label>
                    <select 
                      className="form-select text-xs py-1" 
                      value={promptCategory} 
                      onChange={(e) => setPromptCategory(e.target.value)}
                      disabled={isSystem}
                    >
                      <option value="System">Hệ thống</option>
                      <option value="Format">Định dạng</option>
                      <option value="Style">Văn phong</option>
                      <option value="Outline Expansion">Mở rộng dàn ý</option>
                      <option value="Character Memory">Trí nhớ Nhân vật</option>
                      <option value="Summary Generator">Tạo Tóm tắt</option>
                    </select>
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="text-[10px] font-bold text-gray-400">Độ ưu tiên</label>
                    <input 
                      type="number" 
                      className="form-input text-xs py-1" 
                      value={priority}
                      onChange={(e) => setPriority(parseInt(e.target.value) || 0)}
                      disabled={isSystem}
                    />
                  </div>
                  <div className="flex items-center gap-2 mt-4">
                    <input 
                      type="checkbox" 
                      id="is_cacheable"
                      checked={isCacheable}
                      onChange={(e) => setIsCacheable(e.target.checked)}
                      disabled={isSystem}
                      className="w-4 h-4 accent-indigo-500"
                    />
                    <label htmlFor="is_cacheable" className="text-xs font-bold text-gray-400 cursor-pointer">
                      Có thể lưu Cache
                    </label>
                  </div>
                </div>

                <div className="flex-1 mt-2">
                  <textarea 
                    className="form-textarea font-mono text-sm leading-relaxed min-h-[350px] w-100" 
                    value={editorContent}
                    onChange={(e) => setEditorContent(e.target.value)}
                    disabled={isSystem}
                  />
                </div>

                {/* Variables help card */}
                <div className="p-4 rounded-xl bg-indigo-500/5 border border-indigo-500/10 text-xs">
                  <h4 className="font-bold text-indigo-400 flex items-center gap-1 mb-2">
                    <HelpCircle size={14} /> Tham chiếu các biến Prompt
                  </h4>
                  <p className="text-gray-400 mb-2">Công cụ viết sẽ biên dịch các thẻ này một cách linh hoạt trước khi gửi yêu cầu:</p>
                  <div className="grid-cols-2 gap-2 text-gray-500">
                    <div><code>{"{{style}}"}</code> - Giọng điệu văn phong</div>
                    <div><code>{"{{pov}}"}</code> - Ngôi kể của truyện</div>
                    <div><code>{"{{language}}"}</code> - Ngôn ngữ viết</div>
                    <div><code>{"{{target_length}}"}</code> - Số chữ mục tiêu của chương</div>
                  </div>
                </div>
              </>
            ) : (
              <div className="text-center py-24 text-gray-500">Chọn một prompt từ danh sách để bắt đầu chỉnh sửa.</div>
            )}
          </div>

          {/* Version Logs */}
          <div className="glass-card flex flex-col gap-4">
            <h2 className="card-title text-sm uppercase tracking-wider text-indigo-400 flex items-center gap-1">
              <FileText size={16} /> Lịch sử Phiên bản
            </h2>
            {isSystem ? (
              <div className="text-gray-500 text-xs py-4 text-center flex flex-col gap-2 items-center">
                <ShieldCheck size={28} className="text-emerald-500" />
                <p>Prompt hệ thống dùng phiên bản v1.0.0 (Được bảo vệ)</p>
              </div>
            ) : versions.length === 0 ? (
              <div className="text-gray-500 text-xs py-4 text-center">Chưa có nhật ký phiên bản nào được lưu.</div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[500px] overflow-y-auto pr-1">
                {versions.map((v) => (
                  <div key={v.id} className="p-3 rounded-lg bg-white/5 border border-white/5 flex flex-col gap-2">
                    <div className="flex justify-between items-center">
                      <span className="font-bold text-gray-300 text-xs">Phiên bản {v.version}</span>
                      <button 
                        onClick={() => handleRestore(v.version)}
                        className="btn btn-secondary py-1 px-2 text-[10px] flex items-center gap-1 hover:border-indigo-500/30"
                        disabled={isSystem}
                      >
                        <RotateCcw size={10} /> Khôi phục
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-500">Lưu lúc: {new Date(v.created_at).toLocaleString()}</p>
                    <p className="text-[11px] text-gray-400 line-clamp-2 italic font-mono bg-black/20 p-2 rounded">
                      {v.content}
                    </p>
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

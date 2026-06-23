"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { Settings, Save, RefreshCw, Cpu, Database, Eye } from "lucide-react";

export default function SettingsPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  
  // Settings state
  const [apiMode, setApiMode] = useState("free");
  const [workflowMode, setWorkflowMode] = useState("hybrid");
  const [modelPro, setModelPro] = useState("gemini-2.5-pro");
  const [modelFlash, setModelFlash] = useState("gemini-2.5-flash");
  
  // Budgets state
  const [maxInput, setMaxInput] = useState(6000);
  const [styleRules, setStyleRules] = useState(500);
  const [characters, setCharacters] = useState(1000);
  const [worldRules, setWorldRules] = useState(800);
  const [currentArc, setCurrentArc] = useState(500);
  const [facts, setFacts] = useState(300);
  const [threads, setThreads] = useState(300);
  const [events, setEvents] = useState(1000);
  const [outline, setOutline] = useState(1000);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/settings");
      if (res.ok) {
        const data = await res.json();
        if (data.api_mode) setApiMode(data.api_mode);
        if (data.workflow_mode) setWorkflowMode(data.workflow_mode);
        if (data.model_pro) setModelPro(data.model_pro);
        if (data.model_flash) setModelFlash(data.model_flash);
        
        if (data.budget_max_input_tokens) setMaxInput(parseInt(data.budget_max_input_tokens));
        if (data.budget_style_rules) setStyleRules(parseInt(data.budget_style_rules));
        if (data.budget_selected_characters) setCharacters(parseInt(data.budget_selected_characters));
        if (data.budget_selected_world_rules) setWorldRules(parseInt(data.budget_selected_world_rules));
        if (data.budget_current_arc) setCurrentArc(parseInt(data.budget_current_arc));
        if (data.budget_long_term_facts) setFacts(parseInt(data.budget_long_term_facts));
        if (data.budget_open_threads) setThreads(parseInt(data.budget_open_threads));
        if (data.budget_retrieved_events) setEvents(parseInt(data.budget_retrieved_events));
        if (data.budget_outline) setOutline(parseInt(data.budget_outline));
      }
    } catch (e) {
      console.error("Failed to load settings:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    
    const settingsPayload = {
      api_mode: apiMode,
      workflow_mode: workflowMode,
      model_pro: modelPro,
      model_flash: modelFlash,
      budget_max_input_tokens: String(maxInput),
      budget_style_rules: String(styleRules),
      budget_selected_characters: String(characters),
      budget_selected_world_rules: String(worldRules),
      budget_current_arc: String(currentArc),
      budget_long_term_facts: String(facts),
      budget_open_threads: String(threads),
      budget_retrieved_events: String(events),
      budget_outline: String(outline)
    };

    try {
      const res = await fetch("http://127.0.0.1:8000/api/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ settings: settingsPayload })
      });
      if (res.ok) {
        alert("Đã lưu cấu hình hệ thống thành công.");
      } else {
        alert("Không thể lưu cấu hình.");
      }
    } catch (err) {
      alert("Lỗi kết nối máy chủ.");
    } finally {
      setSaving(false);
    }
  };

  const totalAllocated = styleRules + characters + worldRules + currentArc + facts + threads + events + outline;

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-8 flex justify-between items-center">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Cấu hình Hệ thống</h1>
            <p className="text-gray-400 mt-1">Định cấu hình chỉ định mô hình Gemini, phân bổ token ngân sách và chế độ API hoạt động.</p>
          </div>
          <button onClick={fetchSettings} className="btn btn-secondary py-2 px-3 flex items-center gap-1">
            <RefreshCw size={16} />
            <span>Đồng bộ Cấu hình</span>
          </button>
        </header>

        {loading ? (
          <div className="text-gray-400 text-center py-24">Đang tải cấu hình hệ thống...</div>
        ) : (
          <form onSubmit={handleSave} className="grid-cols-2 gap-8 items-start">
            
            {/* Left Column: API & Models */}
            <div className="flex flex-col gap-6">
              
              {/* API Mode */}
              <div className="glass-card flex flex-col gap-4">
                <h2 className="card-title flex items-center gap-2 text-indigo-400">
                  <Database size={20} /> Chế độ hoạt động
                </h2>
                
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-400">Chế độ API Hoạt động</label>
                  <select 
                    className="form-select" 
                    value={apiMode} 
                    onChange={(e) => setApiMode(e.target.value)}
                  >
                    <option value="free">Chế độ Miễn phí (Sử dụng kho API Key của bạn + xoay vòng)</option>
                    <option value="paid">Chế độ Trả phí (Sử dụng Key hệ thống + Gemini Context Cache)</option>
                  </select>
                </div>

                <div className="flex flex-col gap-2 mt-4">
                  <label className="text-xs font-semibold text-gray-400">Chế độ Luồng công việc</label>
                  <select 
                    className="form-select" 
                    value={workflowMode} 
                    onChange={(e) => setWorkflowMode(e.target.value)}
                  >
                    <option value="hybrid">Luồng Hybrid (Pro + Flash - Chất lượng tối đa)</option>
                    <option value="flash_only">Luồng Flash-Only (Toàn bộ bằng Flash - Tiết kiệm tối đa)</option>
                  </select>
                </div>
              </div>

              {/* Models assign */}
              <div className="glass-card flex flex-col gap-4">
                <h2 className="card-title flex items-center gap-2 text-indigo-400">
                  <Cpu size={20} /> Chỉ định Mô hình Gemini
                </h2>
                
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-semibold text-gray-400">Chỉ định Mô hình Pro</label>
                  <input 
                    type="text" 
                    className="form-input text-sm font-mono" 
                    value={modelPro}
                    onChange={(e) => setModelPro(e.target.value)}
                    placeholder="gemini-2.5-pro"
                  />
                  <span className="text-[10px] text-gray-500">Sử dụng cho các tác vụ phức tạp: Lập kế hoạch, Soạn thảo, Kiểm tra chuyên sâu, Tự sửa lỗi.</span>
                </div>

                <div className="flex flex-col gap-2 mt-2">
                  <label className="text-xs font-semibold text-gray-400">Chỉ định Mô hình Flash</label>
                  <input 
                    type="text" 
                    className="form-input text-sm font-mono" 
                    value={modelFlash}
                    onChange={(e) => setModelFlash(e.target.value)}
                    placeholder="gemini-2.5-flash"
                  />
                  <span className="text-[10px] text-gray-500">Sử dụng cho các tác vụ nhẹ: Kiểm tra nhanh, Tạo trí nhớ, Trích xuất sự kiện, Theo dõi Arc cốt truyện.</span>
                </div>
              </div>

              <button 
                type="submit" 
                className="btn btn-primary w-full py-3"
                disabled={saving}
              >
                <Save size={18} />
                <span>{saving ? "Đang lưu cấu hình..." : "Lưu cấu hình Hệ thống"}</span>
              </button>
            </div>

            {/* Right Column: Token Budgets */}
            <div className="glass-card flex flex-col gap-5">
              <h2 className="card-title flex items-center gap-2 text-indigo-400">
                <Settings size={20} /> Quản lý Ngân sách Token đầu vào (Input)
              </h2>

              <div className="flex flex-col gap-2">
                <div className="flex justify-between text-xs font-bold">
                  <span className="text-gray-400">Giới hạn Tổng Ngân sách đầu vào</span>
                  <span className="text-white">{maxInput} Tokens</span>
                </div>
                <input 
                  type="range" 
                  min="3000" 
                  max="12000" 
                  step="500" 
                  className="w-full accent-indigo-500 cursor-pointer"
                  value={maxInput}
                  onChange={(e) => setMaxInput(parseInt(e.target.value))}
                />
              </div>

              <div className="border-t border-white/5 pt-4 flex flex-col gap-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500 mb-2">Phân bổ theo Danh mục</h3>

                {[
                  { label: "Quy tắc Văn phong (Bibles)", val: styleRules, setVal: setStyleRules },
                  { label: "Thông tin Nhân vật chính", val: characters, setVal: setCharacters },
                  { label: "Tài liệu Thiết lập Thế giới", val: worldRules, setVal: setWorldRules },
                  { label: "Trí nhớ Arc hiện tại", val: currentArc, setVal: setCurrentArc },
                  { label: "Sự kiện Dài hạn (Long Term Facts)", val: facts, setVal: setFacts },
                  { label: "Tuyến cốt truyện chưa giải quyết", val: threads, setVal: setThreads },
                  { label: "Trí nhớ sự kiện truy xuất", val: events, setVal: setEvents },
                  { label: "Kích thước Dàn ý Chương", val: outline, setVal: setOutline }
                ].map((budget, idx) => (
                  <div key={idx} className="flex items-center justify-between gap-4 text-sm">
                    <span className="text-gray-400 text-xs">{budget.label}</span>
                    <input 
                      type="number" 
                      className="form-input text-xs py-1 px-2 w-[80px] text-right font-mono" 
                      value={budget.val}
                      onChange={(e) => budget.setVal(parseInt(e.target.value) || 0)}
                    />
                  </div>
                ))}

                <div className={`mt-4 p-3 rounded-lg border flex items-center justify-between text-xs font-bold ${
                  totalAllocated <= maxInput 
                    ? "bg-emerald-500/5 border-emerald-500/10 text-emerald-400" 
                    : "bg-red-500/5 border-red-500/10 text-red-400"
                }`}>
                  <span>Tổng phân bổ:</span>
                  <span>{totalAllocated} / {maxInput} Tokens</span>
                </div>
              </div>
            </div>

          </form>
        )}
      </main>
    </div>
  );
}

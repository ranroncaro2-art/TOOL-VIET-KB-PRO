"use client";

import { useEffect, useState } from "react";
import Navigation from "@/components/Navigation";
import { Plus, Trash2, ShieldCheck, RefreshCw, Key, AlertTriangle, Play } from "lucide-react";

interface ApiKey {
  id: number;
  key_value: string;
  status: string;
  cooldown_until: string | null;
  error_count: number;
  quota_errors: number;
  last_used: string | null;
}

export default function KeysPage() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [newKey, setNewKey] = useState("");
  const [testResult, setTestResult] = useState<{ status: string; message: string } | null>(null);
  const [testing, setTesting] = useState(false);
  const [loading, setLoading] = useState(true);

  const fetchKeys = async () => {
    try {
      const res = await fetch("http://127.0.0.1:8000/api/keys");
      const data = await res.json();
      setKeys(data);
    } catch (e) {
      console.error("Failed to load keys:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchKeys();
  }, []);

  const handleTestKey = async () => {
    if (!newKey.trim()) return;
    setTesting(true);
    setTestResult(null);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/keys/test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_value: newKey.trim() })
      });
      const data = await res.json();
      setTestResult(data);
    } catch (e) {
      setTestResult({ status: "failed", message: "Failed to connect to API validation server." });
    } finally {
      setTesting(false);
    }
  };

  const handleAddKey = async () => {
    if (!newKey.trim()) return;
    try {
      const res = await fetch("http://127.0.0.1:8000/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key_value: newKey.trim() })
      });
      if (res.ok) {
        setNewKey("");
        setTestResult(null);
        fetchKeys();
      } else {
        const err = await res.json();
        alert(err.detail || "Failed to add key");
      }
    } catch (e) {
      alert("Failed to add key.");
    }
  };

  const handleDeleteKey = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa API Key này không?")) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/keys/${id}`, { method: "DELETE" });
      setKeys(keys.filter(k => k.id !== id));
    } catch (e) {
      alert("Không thể xóa API Key.");
    }
  };

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-8">
          <h1 className="text-3xl font-bold tracking-tight text-white">Quản lý API Key</h1>
          <p className="text-gray-400 mt-1">Cấu hình API Key cho Chế độ Miễn phí. Hệ thống sẽ phân phối các tác vụ xoay vòng các Key trong kho.</p>
        </header>

        <section className="grid-cols-2 gap-8 items-start">
          {/* Key Registrar */}
          <div className="glass-card flex flex-col gap-5">
            <h2 className="card-title">Đăng ký Gemini API Key</h2>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-400">Giá trị API Key</label>
              <input 
                type="password" 
                className="form-input" 
                placeholder="AIzaSy..." 
                value={newKey}
                onChange={(e) => setNewKey(e.target.value)}
              />
            </div>

            <div className="flex gap-3">
              <button 
                onClick={handleTestKey} 
                className="btn btn-secondary flex-1"
                disabled={testing || !newKey.trim()}
              >
                {testing ? "Đang kiểm tra..." : "Kiểm tra tình trạng Key"}
              </button>
              
              <button 
                onClick={handleAddKey} 
                className="btn btn-primary flex-1"
                disabled={!newKey.trim()}
              >
                <Plus size={16} />
                <span>Lưu Key vào Kho</span>
              </button>
            </div>

            {testResult && (
              <div className={`p-4 rounded-xl border ${
                testResult.status === "success" 
                  ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400" 
                  : "bg-red-500/10 border-red-500/20 text-red-400"
              }`}>
                <div className="flex items-start gap-2">
                  {testResult.status === "success" ? <ShieldCheck size={20} /> : <AlertTriangle size={20} />}
                  <div>
                    <h4 className="font-bold text-sm">{testResult.status === "success" ? "Kiểm tra Thành công" : "Kiểm tra Thất bại"}</h4>
                    <p className="text-xs mt-1 leading-relaxed">{testResult.message}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Key Pool Monitor */}
          <div className="glass-card flex flex-col gap-5">
            <div className="flex justify-between items-center">
              <h2 className="card-title">Kho Key Hoạt động ({keys.length})</h2>
              <button onClick={fetchKeys} className="btn btn-secondary p-2">
                <RefreshCw size={16} />
              </button>
            </div>

            {loading ? (
              <div className="text-gray-500 text-center py-6">Đang tải danh sách Key...</div>
            ) : keys.length === 0 ? (
              <div className="text-center py-8 border border-dashed border-white/5 rounded-xl text-gray-500">
                <Key className="mx-auto mb-2 text-gray-600" size={32} />
                <p>Chưa có API Key nào được cấu hình</p>
                <p className="text-xs text-gray-600 mt-1">Thêm một hoặc nhiều Key để bắt đầu viết truyện tự động.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 max-h-[350px] overflow-y-auto pr-1">
                {keys.map((key) => {
                  const isCooldown = key.status === "cooldown";
                  
                  return (
                    <div key={key.id} className="flex items-center justify-between p-3 rounded-lg bg-white/5 border border-white/5 hover:border-white/10">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-mono text-sm text-gray-300">
                            ••••••••••••{key.key_value.slice(-6)}
                          </span>
                          <span className={`badge ${
                            isCooldown 
                              ? "badge-danger" 
                              : key.status === "active" 
                              ? "badge-success" 
                              : "badge-warning"
                          } text-[10px]`}>
                            {key.status === "active" ? "Hoạt động" : isCooldown ? "Thời gian chờ" : key.status}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-2 text-[10px] text-gray-500">
                          <span>Số lỗi: {key.error_count}</span>
                          <span>Lỗi giới hạn Quota: {key.quota_errors}</span>
                          {isCooldown && key.cooldown_until && (
                            <span className="text-red-400">
                              Chờ đến: {new Date(key.cooldown_until).toLocaleTimeString()}
                            </span>
                          )}
                        </div>
                      </div>
                      <button 
                        onClick={() => handleDeleteKey(key.id)} 
                        className="btn btn-secondary py-1 px-2 text-red-400 hover:bg-red-500/10 hover:border-red-500/20"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Navigation from "@/components/Navigation";
import { ArrowLeft, Sparkles, BookOpen, Layers } from "lucide-react";
import Link from "next/link";

interface Preset {
  id: number;
  name: string;
  description: string;
  variables: Record<string, string>;
}

export default function NewStoryPage() {
  const router = useRouter();
  const [presets, setPresets] = useState<Preset[]>([]);
  
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [language, setLanguage] = useState("vi");
  const [selectedPresetId, setSelectedPresetId] = useState<number | null>(null);
  const [pov, setPov] = useState("third_person");
  const [style, setStyle] = useState("realistic");
  const [targetLength, setTargetLength] = useState(2000);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const fetchPresets = async () => {
      try {
        const res = await fetch("http://127.0.0.1:8000/api/presets");
        const data = await res.json();
        setPresets(data);
        if (data.length > 0) {
          setSelectedPresetId(data[0].id);
          applyPresetVariables(data[0]);
        }
      } catch (e) {
        console.error("Failed to fetch presets:", e);
      }
    };
    fetchPresets();
  }, []);

  const applyPresetVariables = (preset: Preset) => {
    if (preset.variables.style) setStyle(preset.variables.style);
    if (preset.variables.pov) setPov(preset.variables.pov);
    if (preset.variables.target_length) setTargetLength(parseInt(preset.variables.target_length));
  };

  const handlePresetChange = (presetId: number) => {
    setSelectedPresetId(presetId);
    const selected = presets.find(p => p.id === presetId);
    if (selected) {
      applyPresetVariables(selected);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    
    setSubmitting(true);
    try {
      const res = await fetch("http://127.0.0.1:8000/api/stories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          description: description.trim(),
          language,
          pov,
          style,
          target_length: targetLength
        })
      });
      
      if (res.ok) {
        const data = await res.json();
        router.push(`/stories/${data.id}`);
      } else {
        alert("Không thể tạo truyện.");
      }
    } catch (err) {
      alert("Đã xảy ra lỗi khi kết nối với máy chủ.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-8">
          <Link href="/" className="btn btn-secondary py-1.5 px-3 text-xs mb-4 inline-flex items-center gap-1">
            <ArrowLeft size={14} /> Quay lại Bảng điều khiển
          </Link>
          <h1 className="text-3xl font-bold tracking-tight text-white">Tạo Truyện Mới</h1>
          <p className="text-gray-400 mt-1">Khởi tạo các cấu hình dự án truyện, ngôn ngữ và phong cách viết ban đầu.</p>
        </header>

        <form onSubmit={handleSubmit} className="grid-cols-2 gap-8 items-start">
          {/* Main info card */}
          <div className="glass-card flex flex-col gap-5">
            <h2 className="card-title flex items-center gap-2 text-indigo-400">
              <BookOpen size={20} /> Thông tin Cơ bản
            </h2>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-400">Tiêu đề Tiểu thuyết *</label>
              <input 
                type="text" 
                className="form-input" 
                placeholder="Nhập tiêu đề truyện..." 
                value={title} 
                onChange={(e) => setTitle(e.target.value)} 
                required 
              />
            </div>
            
            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-400">Tóm tắt Cốt truyện cốt lõi / Mô tả</label>
              <textarea 
                className="form-textarea min-h-[120px]" 
                placeholder="Viết một đoạn ngắn giới thiệu nội dung truyện. Đoạn văn này sẽ định hướng ban đầu cho việc phân chia dàn ý..."
                value={description} 
                onChange={(e) => setDescription(e.target.value)} 
              />
            </div>

            <div className="grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-400">Ngôn ngữ viết</label>
                <select className="form-select" value={language} onChange={(e) => setLanguage(e.target.value)}>
                  <option value="vi">Tiếng Việt (VI)</option>
                  <option value="ja">日本語 (JA)</option>
                  <option value="en">English (EN)</option>
                </select>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-400">Ngôi kể (Point Of View)</label>
                <select className="form-select" value={pov} onChange={(e) => setPov(e.target.value)}>
                  <option value="third_person">Ngôi thứ ba (Kể từ ngôi thứ 3 - Ông/Bà/Họ/Tên)</option>
                  <option value="first_person">Ngôi thứ nhất (Kể từ ngôi thứ 1 - Tôi/Ta/Chúng tôi)</option>
                </select>
              </div>
            </div>
          </div>

          {/* Preset & Parameters */}
          <div className="glass-card flex flex-col gap-5">
            <h2 className="card-title flex items-center gap-2 text-indigo-400">
              <Layers size={20} /> Cấu hình Văn phong & Thông số mục tiêu
            </h2>

            <div className="flex flex-col gap-2">
              <label className="text-sm font-semibold text-gray-400">Chọn cấu hình viết có sẵn (Preset)</label>
              <select 
                className="form-select" 
                value={selectedPresetId || ""} 
                onChange={(e) => handlePresetChange(parseInt(e.target.value))}
              >
                {presets.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>

            <div className="grid-cols-2 gap-4">
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-400">Phong cách / Giọng điệu viết</label>
                <input 
                  type="text" 
                  className="form-input" 
                  value={style} 
                  onChange={(e) => setStyle(e.target.value)} 
                />
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-sm font-semibold text-gray-400">Số từ mục tiêu (từ/chương)</label>
                <input 
                  type="number" 
                  className="form-input" 
                  value={targetLength} 
                  onChange={(e) => setTargetLength(parseInt(e.target.value))} 
                />
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-white/5 flex flex-col gap-3">
              <div className="text-xs text-gray-500 leading-relaxed">
                <p className="font-semibold text-gray-400 mb-1">Các thực thể khởi tạo tự động:</p>
                - Cấu hình sẵn tài liệu Quy tắc Văn phong (Style Bible) phiên bản 1.<br />
                - Khởi tạo tài liệu Thiết lập Thế giới (World Bible) phiên bản 1 phác thảo bối cảnh.<br />
                - Tự động tạo phần cốt truyện mở đầu (Introduction Arc).
              </div>
              
              <button 
                type="submit" 
                className="btn btn-primary mt-2 w-full"
                disabled={submitting || !title.trim()}
              >
                <Sparkles size={16} />
                <span>{submitting ? "Đang khởi tạo cấu trúc truyện..." : "Tạo Không gian làm việc"}</span>
              </button>
            </div>
          </div>
        </form>
      </main>
    </div>
  );
}

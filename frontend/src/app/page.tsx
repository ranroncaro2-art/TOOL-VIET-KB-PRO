"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Navigation from "@/components/Navigation";
import { Plus, BookOpen, Trash2, ArrowRight, Activity, Calendar } from "lucide-react";

interface Story {
  id: number;
  title: string;
  description: string;
  status: string;
  language: string;
  pov: string;
  style: string;
  created_at: string;
  written_chapters_count: number;
  total_chapters_count: number;
}

interface ApiKey {
  id: number;
  status: string;
}

export default function Dashboard() {
  const [stories, setStories] = useState<Story[]>([]);
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = async () => {
    try {
      const resStories = await fetch("http://127.0.0.1:8000/api/stories");
      const dataStories = await resStories.json();
      setStories(dataStories);

      const resKeys = await fetch("http://127.0.0.1:8000/api/keys");
      const dataKeys = await resKeys.json();
      setKeys(dataKeys);
    } catch (e) {
      console.error("Failed to load dashboard data:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleDelete = async (id: number) => {
    if (!confirm("Bạn có chắc chắn muốn xóa truyện này? Tất cả các chương và tài liệu thiết lập sẽ bị xóa vĩnh viễn.")) return;
    try {
      await fetch(`http://127.0.0.1:8000/api/stories/${id}`, { method: "DELETE" });
      setStories(stories.filter(s => s.id !== id));
    } catch (e) {
      alert("Không thể xóa truyện.");
    }
  };

  return (
    <div className="dashboard-container">
      <Navigation />
      
      <main className="main-content">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Không gian Viết truyện</h1>
            <p className="text-gray-400 mt-1">Thiết kế và soạn thảo tiểu thuyết dài tập với vòng lặp ngữ cảnh Gemini 2.5.</p>
          </div>
          <Link href="/stories/new" className="btn btn-primary">
            <Plus size={20} />
            <span>Tạo Truyện Mới</span>
          </Link>
        </header>

        {/* Info Grid */}
        <section className="grid-cols-3 mb-8">
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm font-semibold">Truyện đang hoạt động</span>
              <BookOpen className="text-indigo-400" size={24} />
            </div>
            <p className="text-3xl font-bold text-white">{stories.length}</p>
          </div>
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm font-semibold">Kho API Key</span>
              <Activity className="text-cyan-400" size={24} />
            </div>
            <p className="text-3xl font-bold text-white">
              {keys.filter(k => k.status === "active").length} <span className="text-sm text-gray-500 font-normal">/ {keys.length} đang hoạt động</span>
            </p>
          </div>
          <div className="glass-card">
            <div className="flex items-center justify-between mb-4">
              <span className="text-gray-400 text-sm font-semibold">Chế độ Hệ thống</span>
              <span className="badge badge-info pulse-glow">Luồng Miễn phí</span>
            </div>
            <p className="text-lg font-medium text-gray-300">Cân bằng tải nhiều Key</p>
          </div>
        </section>

        {/* Stories List */}
        <section className="glass-card">
          <h2 className="card-title mb-6">Bộ sưu tập Truyện của bạn</h2>
          {loading ? (
            <div className="text-center py-12 text-gray-500">Đang tải danh sách truyện...</div>
          ) : stories.length === 0 ? (
            <div className="text-center py-16 border border-dashed border-white/5 rounded-xl">
              <BookOpen className="mx-auto text-gray-600 mb-4" size={48} />
              <h3 className="text-lg font-medium text-gray-400">Chưa có truyện nào được tạo</h3>
              <p className="text-sm text-gray-500 mt-1 max-w-md mx-auto">Bắt đầu dự án tiểu thuyết của bạn bằng cách thiết lập dàn ý, quy tắc ngôn ngữ và cài đặt prompt.</p>
              <Link href="/stories/new" className="btn btn-primary mt-6">
                <Plus size={16} /> Tạo Truyện Đầu Tiên
              </Link>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {stories.map((story) => (
                <div key={story.id} className="flex items-center justify-between p-4 rounded-xl bg-white/5 border border-white/5 hover:border-indigo-500/30 transition-all duration-300">
                  <div className="flex-1">
                    <div className="flex items-center gap-3">
                      <h3 className="text-lg font-semibold text-white">{story.title}</h3>
                      <span className="badge badge-info text-xs uppercase">{story.language}</span>
                      <span className={`badge ${story.status === 'completed' ? 'badge-success' : 'badge-warning'} text-xs`}>
                        {story.status === 'completed' ? 'Xong' : `Đã viết ${story.written_chapters_count || 0}/${story.total_chapters_count || 0}`}
                      </span>
                    </div>
                    <p className="text-sm text-gray-400 mt-1 max-w-2xl line-clamp-1">{story.description || "Chưa có tóm tắt nội dung."}</p>
                    <div className="flex items-center gap-6 mt-3 text-xs text-gray-500">
                      <span className="flex items-center gap-1"><Calendar size={14} /> Ngày tạo: {new Date(story.created_at).toLocaleDateString()}</span>
                      <span>Ngôi kể (POV): {story.pov}</span>
                      <span>Văn phong: {story.style}</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Link href={`/stories/${story.id}`} className="btn btn-secondary py-2 px-3">
                      <span>Không gian làm việc</span>
                      <ArrowRight size={16} />
                    </Link>
                    <button onClick={() => handleDelete(story.id)} className="btn btn-secondary py-2 px-2 text-red-400 hover:bg-red-500/10 hover:border-red-500/30">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

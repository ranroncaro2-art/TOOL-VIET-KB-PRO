"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Key, Settings, BookMarked, Terminal, Activity } from "lucide-react";

export default function Navigation() {
  const pathname = usePathname();

  const menuItems = [
    { name: "Truyện của tôi", href: "/", icon: BookOpen },
    { name: "Hàng đợi tác vụ", href: "/queue", icon: Activity },
    { name: "Quản lý API Key", href: "/keys", icon: Key },
    { name: "Quản lý Prompt", href: "/prompts", icon: Terminal },
    { name: "Cấu hình hệ thống", href: "/settings", icon: Settings },
  ];

  return (
    <aside className="sidebar">
      <div className="sidebar-logo">
        <BookMarked size={28} className="text-indigo-400" />
        <span>Novel Writer V3</span>
      </div>
      
      <nav className="sidebar-menu">
        {menuItems.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/" && pathname.startsWith(item.href));
          
          return (
            <Link 
              key={item.name} 
              href={item.href}
              className={`sidebar-item ${isActive ? "active" : ""}`}
            >
              <Icon size={20} />
              <span>{item.name}</span>
            </Link>
          );
        })}
      </nav>
      
      <div className="mt-auto pt-4 border-t border-white/5 text-center text-xs text-gray-500">
        <p>Engine Version v3.0.0</p>
        <p className="mt-1 text-indigo-400/60 font-semibold">Gemini 2.5 Inside</p>
      </div>
    </aside>
  );
}

"use client";

import * as React from "react";
import { Menu, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

export interface EditorHeaderProps {
  onOpenFile?: () => void;
  onInsertFile?: () => void;
}

export function EditorHeader({ onOpenFile, onInsertFile }: EditorHeaderProps) {
  return (
    <header className="sticky top-0 z-30 flex items-center justify-between border-b border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-900/70 px-6 py-3 text-white shadow-2xl shadow-black/20 backdrop-blur-xl">
      {/* Logo اليمين: أفان تيتر */}
      <div className="flex items-center gap-2">
        <div className="bg-gradient-to-r from-[#029784] to-[#40A5B3] bg-clip-text text-xl font-bold text-transparent">
          أفان تيتر
        </div>
      </div>

      {/* المنتصف: القوائم + Online + User */}
      <div className="flex items-center gap-4">
        {/* القوائم */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              className="gap-2 text-white/80 hover:bg-white/10 hover:text-white"
            >
              <Menu className="h-4 w-4" />
              <span>القوائم</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem onClick={onOpenFile}>فتح...</DropdownMenuItem>
            <DropdownMenuItem onClick={onInsertFile}>
              إدراج ملف...
            </DropdownMenuItem>
            <DropdownMenuItem>جديد</DropdownMenuItem>
            <DropdownMenuItem>حفظ</DropdownMenuItem>
            <DropdownMenuItem>تصدير</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {/* Online Badge */}
        <div className="flex items-center gap-2 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-3 py-1">
          <div className="h-2 w-2 animate-pulse rounded-full bg-emerald-500"></div>
          <span className="text-xs font-medium text-emerald-400">Online</span>
        </div>

        {/* أيقونة المستخدم */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="rounded-full hover:bg-white/10"
            >
              <User className="h-5 w-5 text-white/80" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem>الملف الشخصي</DropdownMenuItem>
            <DropdownMenuItem>الإعدادات</DropdownMenuItem>
            <DropdownMenuItem>تسجيل الخروج</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Logo اليسار: النسخة */}
      <div className="flex items-center gap-2">
        <div className="bg-gradient-to-r from-[#746842] to-[#40A5B3] bg-clip-text text-xl font-bold text-transparent">
          النسخة
        </div>
      </div>
    </header>
  );
}

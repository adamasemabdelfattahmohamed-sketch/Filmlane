"use client";

import React from "react";

interface EditorSidebarProps {
  children?: React.ReactNode;
}

export function EditorSidebar({ children }: EditorSidebarProps) {
  return (
    <div className="no-print sidebar w-64 border-l border-white/10 bg-gradient-to-b from-slate-900/80 to-slate-900/60 backdrop-blur-xl">
      {children}
    </div>
  );
}

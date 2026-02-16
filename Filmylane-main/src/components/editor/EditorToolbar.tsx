"use client";
import {
  Film,
  Download,
  Stethoscope,
  Lightbulb,
  MessageSquare,
  History,
  Upload,
  Save,
  Undo2,
  Redo2,
  Bold,
  Italic,
  AlignRight,
  AlignCenter,
  Info,
} from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Separator } from "@/components/ui/separator";

interface EditorToolbarProps {
  onFormatCommand: (command: string, value?: string) => void;
  onSave?: () => void;
  onDownload?: () => void;
  onHistory?: () => void;
  onInfo?: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onMessages?: () => void;
  onIdeas?: () => void;
  onCheck?: () => void;
}

export function EditorToolbar({
  onFormatCommand,
  onSave,
  onDownload,
  onHistory,
  onInfo,
  onUndo,
  onRedo,
  onMessages,
  onIdeas,
  onCheck,
}: EditorToolbarProps) {
  return (
    <div className="bg-background/80 sticky top-0 z-20 border-b p-2 backdrop-blur-sm">
      <div className="mx-auto w-full max-w-[calc(21cm+4rem)]">
        <div
          className="flex items-center justify-center gap-3 overflow-x-auto rounded-md border bg-card p-2"
          style={{ direction: "rtl" }}
        >
          <TooltipProvider>
            <button
              className="group rounded-lg bg-[#029784]/10 p-2 text-[#029784] transition-all hover:bg-[#029784]/20 hover:text-[#40A5B3]"
              title="Film"
            >
              <Film size={18} />
            </button>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onDownload}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Download"
                >
                  <Download className="h-5 w-5 text-[#40A5B3] group-hover:text-[#029784]" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>تحميل</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onCheck}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Check"
                >
                  <Stethoscope className="h-5 w-5 text-rose-400 group-hover:text-rose-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>فحص</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onIdeas}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Ideas"
                >
                  <Lightbulb className="h-5 w-5 text-[#746842] group-hover:text-yellow-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>أفكار</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onMessages}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Messages"
                >
                  <MessageSquare className="h-5 w-5 text-[#029784] group-hover:text-[#40A5B3]" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>رسائل</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onHistory}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="History"
                >
                  <History className="h-5 w-5 text-amber-400 group-hover:text-amber-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>سجل</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Upload"
                >
                  <Upload className="h-5 w-5 text-indigo-400 group-hover:text-indigo-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>رفع</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onSave}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Save"
                >
                  <Save className="h-5 w-5 text-violet-400 group-hover:text-violet-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>حفظ</p>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 bg-white/10" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onUndo}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Undo"
                >
                  <Undo2 className="h-5 w-5 text-slate-400 group-hover:text-slate-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>تراجع</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onRedo}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Redo"
                >
                  <Redo2 className="h-5 w-5 text-slate-400 group-hover:text-slate-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>إعادة</p>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 bg-white/10" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFormatCommand("bold")}
                  className="group rounded-lg bg-[#029784]/10 p-2 text-[#029784] transition-all hover:bg-[#029784]/20 hover:text-[#40A5B3]"
                  title="عريض"
                >
                  <Bold size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>عريض</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFormatCommand("italic")}
                  className="group rounded-lg bg-violet-500/10 p-2 text-violet-400 transition-all hover:bg-violet-500/20 hover:text-violet-300"
                  title="مائل"
                >
                  <Italic size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>مائل</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFormatCommand("justifyRight")}
                  className="group rounded-lg bg-rose-500/10 p-2 text-rose-400 transition-all hover:bg-rose-500/20 hover:text-rose-300"
                  title="محاذاة يمين"
                >
                  <AlignRight size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>محاذاة يمين</p>
              </TooltipContent>
            </Tooltip>

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={() => onFormatCommand("justifyCenter")}
                  className="group rounded-lg bg-cyan-500/10 p-2 text-cyan-400 transition-all hover:bg-cyan-500/20 hover:text-cyan-300"
                  title="توسيط"
                >
                  <AlignCenter size={18} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>توسيط</p>
              </TooltipContent>
            </Tooltip>

            <Separator orientation="vertical" className="h-6 bg-white/10" />

            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  onClick={onInfo}
                  className="group rounded-lg p-2 transition-all hover:bg-white/10"
                  title="Info"
                >
                  <Info className="h-5 w-5 text-sky-400 group-hover:text-sky-300" />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                <p>معلومات</p>
              </TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </div>
    </div>
  );
}

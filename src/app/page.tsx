import { ScreenplayEditor } from "@/components/editor";

/**
 * الصفحة الرئيسية للتطبيق
 *
 * @description
 * تعرض الصفحة الرئيسية لمحرر السيناريوهات مع ScreenplayEditor كمحتوى رئيسي.
 * هذه الصفحة هي نقطة الدخول الرئيسية للمستخدمين للوصول إلى المحرر.
 *
 * @returns {JSX.Element} الصفحة الرئيسية مع المحرر
 */
export default function Home() {
  return (
    <main className="min-h-screen">
      <ScreenplayEditor />
    </main>
  );
}

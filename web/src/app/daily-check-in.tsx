"use client";

import { useState } from "react";
import { toast } from "sonner";
import { CalendarCheck, Coffee, LoaderCircle } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export function DailyCheckIn({ memberId, date, question, initialStatus, initialVersion, groupReportsToday }: { memberId: string; date: string; question: string; initialStatus: "pending" | "report" | "skip"; initialVersion: number; groupReportsToday: boolean }) {
  const [status, setStatus] = useState(initialStatus);
  const [version, setVersion] = useState(initialVersion);
  const [saving, setSaving] = useState<"report" | "skip" | null>(null);

  async function update(nextStatus: "report" | "skip") {
    if (nextStatus === "report" && !groupReportsToday && !window.confirm("Hôm nay nằm ngoài lịch báo cáo của group. Xác nhận vẫn tạo và gửi báo cáo riêng cho bạn?")) return;
    if (nextStatus === "skip" && !window.confirm("Xác nhận bỏ qua báo cáo hôm nay? Bot sẽ không đăng report của bạn trong ngày này.")) return;
    setSaving(nextStatus);
    const response = await fetch(`/api/members/${memberId}/daily-status`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ expectedVersion: version, status: nextStatus }) });
    const result = await response.json();
    if (!response.ok) {
      toast.error("Không thể cập nhật lịch hôm nay", { description: "Dữ liệu có thể đã thay đổi. Hãy tải lại trang và thử lại." });
      setSaving(null);
      return;
    }
    setStatus(result.status); setVersion(result.version); setSaving(null);
    toast.success(nextStatus === "report" ? "Đã xác nhận báo cáo hôm nay" : "Đã bỏ qua báo cáo hôm nay");
  }

  return <Card className="overflow-hidden border-primary/20 bg-gradient-to-br from-white via-white to-emerald-50/70"><CardContent className="p-6 md:p-8"><div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between"><div className="max-w-2xl"><div className="mb-3 flex flex-wrap items-center gap-2"><Badge variant="outline">Daily check-in · {date}</Badge>{!groupReportsToday && <Badge variant="secondary">Ngoài lịch group</Badge>}{status === "report" && <Badge>Đã xác nhận báo cáo</Badge>}{status === "skip" && <Badge variant="secondary">Nghỉ / bỏ qua hôm nay</Badge>}</div><h2 className="text-xl font-semibold tracking-tight md:text-2xl">{question}</h2><p className="mt-2 text-sm leading-6 text-muted-foreground">{groupReportsToday ? "Mặc định bot vẫn báo cáo theo config. Chỉ lựa chọn bỏ qua mới thay đổi lịch hôm nay." : "Hôm nay group không báo cáo. Nếu bạn chọn vẫn báo cáo, bot sẽ tạo parent post cho group và đăng reply riêng của bạn."}</p></div><div className="grid w-full shrink-0 grid-cols-1 gap-3 sm:grid-cols-2 md:w-auto md:grid-cols-1"><Button size="lg" onClick={() => update("report")} disabled={saving !== null || status === "skip" || status === "report"} className="h-12 w-full min-w-60 justify-center px-5 text-base [&_svg]:size-5">{saving === "report" ? <LoaderCircle className="animate-spin" /> : <CalendarCheck />}{status === "report" ? "Đã chọn báo cáo hôm nay" : "Hôm nay tôi sẽ báo cáo"}</Button><Button size="lg" onClick={() => update("skip")} disabled={saving !== null || status === "skip" || status === "report"} variant="outline" className="h-12 w-full min-w-60 justify-center px-5 text-base [&_svg]:size-5">{saving === "skip" ? <LoaderCircle className="animate-spin" /> : <Coffee />}{status === "skip" ? "Đã bỏ qua hôm nay" : "Bỏ qua báo cáo hôm nay"}</Button></div></div></CardContent></Card>;
}

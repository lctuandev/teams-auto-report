"use client";

import { useState } from "react";
import { CalendarDays, MinusCircle } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";

type Config = {
  schedule: { postAfterTime: string; postAfterRandomWindowMinutes: number; skipIfBeforePostTime: boolean };
  pending: { item: string; solution: string }[];
  innovations: { item: string; support: string }[];
  report: {
    numberTemplate: string;
    countProgressByWorkdaysOnly: boolean;
    initialReportedWorkdaysByMonth: Record<string, number>;
    skipDates: string[];
    extraWorkDates: string[];
  };
};

type MonthlySummary = {
  baseReportedWorkdays: number | null;
  reportedWorkdays: number | null;
  totalWorkdays: number | null;
};

export function ReportConfigEditor({
  memberId,
  initialVersion,
  initialConfig,
  monthlySummaries,
}: {
  memberId: string;
  initialVersion: number;
  initialConfig: Config;
  monthlySummaries: Record<string, MonthlySummary>;
}) {
  const now = new Date();
  const [config, setConfig] = useState(initialConfig);
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const [calendarYear, setCalendarYear] = useState(now.getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(now.getMonth() + 1);
  const [dateMode, setDateMode] = useState<"skip" | "work">("skip");
  const update = (next: Config) => { setConfig(next); setStatus("idle"); };
  const monthKey = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}`;
  const monthSummary = monthlySummaries[monthKey];

  const yearOptions = (() => {
    const years = new Set<number>();
    for (let year = now.getFullYear() - 3; year <= now.getFullYear() + 5; year += 1) years.add(year);
    [...config.report.skipDates, ...config.report.extraWorkDates, ...Object.keys(monthlySummaries)]
      .forEach((value) => years.add(Number(value.slice(0, 4))));
    return [...years].filter(Number.isFinite).sort((a, b) => a - b);
  })();

  function setMonthBase(raw: string) {
    const next = { ...config.report.initialReportedWorkdaysByMonth };
    if (raw === "") delete next[monthKey];
    else next[monthKey] = Math.max(0, Math.min(31, Math.floor(Number(raw))));
    update({ ...config, report: { ...config.report, initialReportedWorkdaysByMonth: next } });
  }

  function toggleDate(date: string) {
    const skipDates = new Set(config.report.skipDates);
    const extraWorkDates = new Set(config.report.extraWorkDates);
    const target = dateMode === "skip" ? skipDates : extraWorkDates;
    const opposite = dateMode === "skip" ? extraWorkDates : skipDates;
    if (target.has(date)) target.delete(date);
    else {
      target.add(date);
      opposite.delete(date);
    }
    update({
      ...config,
      report: {
        ...config.report,
        skipDates: [...skipDates].sort(),
        extraWorkDates: [...extraWorkDates].sort(),
      },
    });
  }

  async function save() {
    setStatus("saving");
    const response = await fetch(`/api/members/${memberId}/report-config`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expectedVersion: version, ...config }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus("idle");
      toast.error("Không thể lưu cấu hình report", {
        description: response.status === 409
          ? "Config đã thay đổi ở nơi khác. Hãy tải lại trang."
          : "Kiểm tra dữ liệu và thử lại.",
      });
      return;
    }
    setVersion(result.version);
    setStatus("idle");
    toast.success("Đã lưu cấu hình report");
  }

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Lịch reply</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2"><Field label="Giờ reply"><Input type="time" value={config.schedule.postAfterTime} onChange={(e) => update({ ...config, schedule: { ...config.schedule, postAfterTime: e.target.value } })} /></Field><Field label="Khoảng random (phút)"><Input type="number" min={0} max={240} value={config.schedule.postAfterRandomWindowMinutes} onChange={(e) => update({ ...config, schedule: { ...config.schedule, postAfterRandomWindowMinutes: Number(e.target.value) } })} /></Field><div className="flex items-center justify-between rounded-xl border p-4 sm:col-span-2"><div><Label>Chờ đến giờ đăng</Label><p className="mt-1 text-xs text-muted-foreground">Không reply trước thời gian đã cấu hình.</p></div><Switch checked={config.schedule.skipIfBeforePostTime} onCheckedChange={(checked) => update({ ...config, schedule: { ...config.schedule, skipIfBeforePostTime: checked } })} /></div></CardContent></Card>

    <Card>
      <CardHeader><CardTitle>Đánh số báo cáo</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <Field label="Number template"><Input value={config.report.numberTemplate} onChange={(e) => update({ ...config, report: { ...config.report, numberTemplate: e.target.value } })} /></Field>
        <div className="rounded-xl border bg-muted/25 p-4 text-sm">
          <p className="font-semibold">Cách tính số báo cáo</p>
          <p className="mt-2 leading-6 text-muted-foreground">
            <code>REPORT_INDEX</code> = số ngày đã báo cáo trước khi bot bắt đầu theo dõi
            + số report bot đã xác nhận trong tháng + 1 cho report kế tiếp.
            <code className="ml-1">MONTH_WORKDAYS</code> là tổng ngày làm việc của group,
            sau khi áp dụng ngày nghỉ/ngày đi làm riêng của bạn.
          </p>
          <p className="mt-2 text-muted-foreground">Ví dụ: base = 13 và bot đã ghi nhận 6 report thì report tiếp theo là số 20.</p>
        </div>
        <div className="grid gap-4 rounded-xl border p-4 md:grid-cols-[1fr_1fr_1.4fr]">
          <Field label="Năm">
            <select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}
            </select>
          </Field>
          <Field label="Tháng">
            <select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
              {Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>Tháng {month}</option>)}
            </select>
          </Field>
          <Field label="Số report trước khi bot theo dõi">
            <div className="flex gap-2">
              <Input type="number" min={0} max={31} placeholder={monthSummary?.baseReportedWorkdays == null ? "Tự động tính" : String(monthSummary.baseReportedWorkdays)} value={config.report.initialReportedWorkdaysByMonth[monthKey] ?? ""} onChange={(event) => setMonthBase(event.target.value)} />
              {config.report.initialReportedWorkdaysByMonth[monthKey] !== undefined && <Button type="button" size="icon" variant="outline" aria-label="Dùng lại cách tính tự động" onClick={() => setMonthBase("")}><MinusCircle /></Button>}
            </div>
          </Field>
          <div className="text-xs leading-5 text-muted-foreground md:col-span-3">
            {monthSummary
              ? `State hiện tại: base ${monthSummary.baseReportedWorkdays ?? "—"}, đã tính ${monthSummary.reportedWorkdays ?? "—"}/${monthSummary.totalWorkdays ?? "—"} ngày.`
              : "Tháng này chưa có state. Để trống để bot tự đếm ngày làm việc từ đầu tháng đến trước report đầu tiên."}
            {" "}Giá trị override đã lưu sẽ được ưu tiên và cập nhật lại state khi bot chạy.
          </div>
        </div>
        <div className="flex items-center justify-between rounded-xl border p-4"><div><Label>Chỉ tăng progress theo ngày làm việc</Label></div><Switch checked={config.report.countProgressByWorkdaysOnly} onCheckedChange={(checked) => update({ ...config, report: { ...config.report, countProgressByWorkdaysOnly: checked } })} /></div>
      </CardContent>
    </Card>

    <Card>
      <CardHeader><CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />Lịch làm việc riêng</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <p className="text-sm leading-6 text-muted-foreground">
          Chọn tháng/năm, chọn chế độ rồi bấm vào ngày. “Ngày nghỉ” khiến riêng bạn không report;
          “Ngày đi làm” cho phép bạn report kể cả cuối tuần hoặc ngày nghỉ của group. Bấm lại ngày đang chọn để bỏ thiết lập riêng.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div className="grid grid-cols-2 gap-3 sm:w-72">
            <Field label="Năm"><select value={calendarYear} onChange={(event) => setCalendarYear(Number(event.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{yearOptions.map((year) => <option key={year} value={year}>{year}</option>)}</select></Field>
            <Field label="Tháng"><select value={calendarMonth} onChange={(event) => setCalendarMonth(Number(event.target.value))} className="h-10 w-full rounded-md border bg-background px-3 text-sm">{Array.from({ length: 12 }, (_, index) => index + 1).map((month) => <option key={month} value={month}>Tháng {month}</option>)}</select></Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant={dateMode === "skip" ? "destructive" : "outline"} onClick={() => setDateMode("skip")}>Chọn ngày nghỉ</Button>
            <Button type="button" variant={dateMode === "work" ? "default" : "outline"} onClick={() => setDateMode("work")}>Chọn ngày đi làm</Button>
          </div>
        </div>
        <MonthCalendar year={calendarYear} month={calendarMonth} skipDates={config.report.skipDates} extraWorkDates={config.report.extraWorkDates} onToggle={toggleDate} />
        <div className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-muted-foreground">
          <span><i className="mr-1 inline-block size-2.5 rounded-full bg-destructive" />Ngày nghỉ riêng</span>
          <span><i className="mr-1 inline-block size-2.5 rounded-full bg-primary" />Ngày đi làm riêng</span>
          <span>Đã chọn: {config.report.skipDates.filter((date) => date.startsWith(monthKey)).length} nghỉ · {config.report.extraWorkDates.filter((date) => date.startsWith(monthKey)).length} đi làm</span>
        </div>
      </CardContent>
    </Card>

    <ListEditor title="Pending list" items={config.pending} left="Nội dung pending" right="Hướng xử lý" onChange={(pending) => update({ ...config, pending })} />
    <ListEditor title="Đổi mới sáng tạo" items={config.innovations.map((item) => ({ item: item.item, solution: item.support }))} left="Nội dung đổi mới" right="Đề xuất hỗ trợ" onChange={(items) => update({ ...config, innovations: items.map((item) => ({ item: item.item, support: item.solution })) })} />
    <div className="flex justify-end"><Button onClick={save} disabled={status === "saving" || !config.report.numberTemplate.trim()}>{status === "saving" ? "Đang lưu…" : "Lưu cấu hình"}</Button></div>
  </div>;
}

function MonthCalendar({ year, month, skipDates, extraWorkDates, onToggle }: { year: number; month: number; skipDates: string[]; extraWorkDates: string[]; onToggle: (date: string) => void }) {
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mondayOffset = (new Date(Date.UTC(year, month - 1, 1)).getUTCDay() + 6) % 7;
  const cells = [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: daysInMonth }, (_, index) => index + 1)];
  return <div className="overflow-hidden rounded-xl border">
    <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
      {["T2", "T3", "T4", "T5", "T6", "T7", "CN"].map((day) => <div key={day} className="py-2">{day}</div>)}
    </div>
    <div className="grid grid-cols-7">
      {cells.map((day, index) => {
        if (day === null) return <div key={`empty-${index}`} className="min-h-14 border-b border-r bg-muted/10 sm:min-h-16" />;
        const date = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
        const isSkip = skipDates.includes(date);
        const isWork = extraWorkDates.includes(date);
        return <button key={date} type="button" onClick={() => onToggle(date)} aria-label={`${date}${isSkip ? " ngày nghỉ" : isWork ? " ngày đi làm" : ""}`} className={`relative min-h-14 border-b border-r p-2 text-left text-sm transition-colors sm:min-h-16 ${isSkip ? "bg-destructive/10 text-destructive hover:bg-destructive/15" : isWork ? "bg-primary/10 text-primary hover:bg-primary/15" : "hover:bg-muted/60"}`}>
          <span className="font-medium">{day}</span>
          {(isSkip || isWork) && <span className={`absolute bottom-2 right-2 size-2 rounded-full ${isSkip ? "bg-destructive" : "bg-primary"}`} />}
        </button>;
      })}
    </div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>; }
function ListEditor({ title, items, left, right, onChange }: { title: string; items: { item: string; solution: string }[]; left: string; right: string; onChange: (items: { item: string; solution: string }[]) => void }) { return <Card><CardHeader className="flex-row items-center justify-between"><CardTitle>{title}</CardTitle><Button variant="outline" size="sm" onClick={() => onChange([...items, { item: "", solution: "" }])}>+ Thêm</Button></CardHeader><CardContent className="space-y-4">{items.map((item, index) => <div key={index} className="grid gap-3 rounded-xl border p-4 sm:grid-cols-2"><Field label={left}><Textarea value={item.item} onChange={(e) => onChange(items.map((value, i) => i === index ? { ...value, item: e.target.value } : value))} /></Field><Field label={right}><Textarea value={item.solution} onChange={(e) => onChange(items.map((value, i) => i === index ? { ...value, solution: e.target.value } : value))} /></Field><Button variant="ghost" size="sm" className="justify-self-start text-destructive sm:col-span-2" onClick={() => onChange(items.filter((_, i) => i !== index))}>Xóa dòng</Button></div>)}{!items.length && <p className="py-4 text-center text-sm text-muted-foreground">Chưa có dữ liệu.</p>}</CardContent></Card>; }

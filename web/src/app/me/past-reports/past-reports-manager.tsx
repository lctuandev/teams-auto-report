"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarDays, Check, CircleAlert, Clock3, LoaderCircle, Search } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { createClientUuid } from "@/lib/client-id";
import { isGroupReportDate, renderDateTemplate } from "@/lib/date";
import { cn } from "@/lib/utils";
import type { ReportQueueItem } from "@/lib/schemas/report-queue";

type Props = {
  memberId: string;
  today: string;
  titleTemplate: string;
  groupSchedule: { days: number[]; skipDates: string[]; extraWorkDates: string[] };
  reportData: {
    postedDates: string[];
    skipDates: string[];
    extraWorkDates: string[];
  };
  initialQueue: ReportQueueItem[];
};

type BackfillTask = {
  id: string;
  title: string;
  startPercent: number;
  dailyIncrease: number | null;
  dailyIncreaseRange: [number, number] | null;
  maxPercent: number;
};

function newBackfillTask(): BackfillTask {
  return {
    id: `backfill_task_${createClientUuid()}`,
    title: "",
    startPercent: 0,
    dailyIncrease: 5,
    dailyIncreaseRange: null,
    maxPercent: 100,
  };
}

const weekDays = ["T2", "T3", "T4", "T5", "T6", "T7", "CN"];
const monthNames = ["Tháng 1", "Tháng 2", "Tháng 3", "Tháng 4", "Tháng 5", "Tháng 6", "Tháng 7", "Tháng 8", "Tháng 9", "Tháng 10", "Tháng 11", "Tháng 12"];

export function PastReportsManager({ memberId, today, titleTemplate, groupSchedule, reportData, initialQueue }: Props) {
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const [year, setYear] = useState(todayYear);
  const [month, setMonth] = useState(todayMonth);
  const [selected, setSelected] = useState<string[]>([]);
  const [queue, setQueue] = useState(initialQueue);
  const [tasks, setTasks] = useState<BackfillTask[]>(() => [newBackfillTask()]);
  const [submitting, setSubmitting] = useState(false);
  const posted = useMemo(() => new Set(reportData.postedDates), [reportData.postedDates]);
  const queueByDate = useMemo(() => new Map(queue.map((item) => [item.date, item])), [queue]);
  const effectiveSchedule = useMemo(() => {
    const memberSkipDates = new Set(reportData.skipDates);
    const memberExtraDates = new Set(reportData.extraWorkDates);
    return {
      days: groupSchedule.days,
      skipDates: [...new Set([...reportData.skipDates, ...groupSchedule.skipDates.filter((date) => !memberExtraDates.has(date))])],
      extraWorkDates: [...new Set([...groupSchedule.extraWorkDates, ...reportData.extraWorkDates])].filter((date) => !memberSkipDates.has(date)),
    };
  }, [groupSchedule, reportData.extraWorkDates, reportData.skipDates]);

  useEffect(() => {
    const timer = window.setInterval(async () => {
      const response = await fetch(`/api/members/${memberId}/past-reports`);
      if (response.ok) setQueue((await response.json()).items);
    }, 8_000);
    return () => window.clearInterval(timer);
  }, [memberId]);

  const years = useMemo(() => Array.from({ length: 6 }, (_, index) => todayYear - index), [todayYear]);
  const days = useMemo(() => {
    const count = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const firstDay = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
    const mondayOffset = (firstDay + 6) % 7;
    return [...Array.from({ length: mondayOffset }, () => null), ...Array.from({ length: count }, (_, index) => index + 1)];
  }, [year, month]);

  function isoDate(day: number) {
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  function isAllowed(date: string) {
    if (reportData.skipDates.includes(date)) return false;
    return reportData.extraWorkDates.includes(date) || isGroupReportDate(date, groupSchedule);
  }

  function toggle(date: string) {
    const item = queueByDate.get(date);
    if (date >= today || posted.has(date) || !isAllowed(date) || (item && item.status !== "failed")) return;
    setSelected((current) => {
      if (current.includes(date)) return current.filter((value) => value !== date);
      if (current.length >= 31) {
        toast.error("Mỗi lần chỉ có thể thêm tối đa 31 ngày");
        return current;
      }
      return [...current, date].sort();
    });
  }

  async function enqueue() {
    if (!selected.length || !tasksAreValid) return;
    setSubmitting(true);
    const response = await fetch(`/api/members/${memberId}/past-reports`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        dates: selected,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title.trim(),
          startPercent: task.startPercent,
          maxPercent: task.maxPercent,
          ...(task.dailyIncrease === null ? {} : { dailyIncrease: task.dailyIncrease }),
          ...(task.dailyIncreaseRange === null ? {} : { dailyIncreaseRange: task.dailyIncreaseRange }),
        })),
      }),
    });
    const result = await response.json();
    setSubmitting(false);
    if (!response.ok) {
      toast.error("Không thể thêm báo cáo vào queue", { description: result.error ?? "Hãy thử lại sau." });
      return;
    }
    setQueue(result.items);
    setSelected([]);
    toast.success("Đã thêm vào queue", { description: "Bot sẽ xử lý theo thứ tự ngày tăng dần ở lượt chạy kế tiếp." });
  }

  const previewDate = selected.at(-1);
  const tasksAreValid = tasks.length > 0 && tasks.every((task) =>
    task.title.trim() &&
    task.startPercent >= 0 &&
    task.startPercent <= task.maxPercent &&
    task.maxPercent <= 100 &&
    (task.dailyIncrease !== null || (
      task.dailyIncreaseRange !== null &&
      task.dailyIncreaseRange[0] <= task.dailyIncreaseRange[1]
    )),
  );

  function updateTask(index: number, changes: Partial<BackfillTask>) {
    setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...changes } : task));
  }

  function setIncreaseMode(index: number, random: boolean) {
    const task = tasks[index];
    const value = task.dailyIncrease ?? task.dailyIncreaseRange?.[0] ?? 5;
    updateTask(index, random
      ? { dailyIncrease: null, dailyIncreaseRange: [value, value] }
      : { dailyIncrease: value, dailyIncreaseRange: null });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.35fr_0.85fr]">
      <div className="space-y-6">
        <Card>
          <CardHeader className="border-b">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <CardTitle className="flex items-center gap-2"><CalendarDays className="size-5 text-primary" />Chọn ngày còn thiếu</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Chỉ ngày làm việc đã qua và chưa đăng mới có thể chọn.</p>
              </div>
              <div className="flex gap-2">
                <select aria-label="Chọn tháng" value={month} onChange={(event) => setMonth(Number(event.target.value))} className="h-9 rounded-lg border bg-background px-3 text-sm">
                  {monthNames.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
                </select>
                <select aria-label="Chọn năm" value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-9 rounded-lg border bg-background px-3 text-sm">
                  {years.map((value) => <option key={value} value={value}>{value}</option>)}
                </select>
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-7 gap-1.5">
              {weekDays.map((day) => <div key={day} className="pb-2 text-center text-xs font-medium text-muted-foreground">{day}</div>)}
              {days.map((day, index) => {
                if (day === null) return <div key={`empty-${index}`} />;
                const date = isoDate(day);
                const item = queueByDate.get(date);
                const selectedDate = selected.includes(date);
                const isPosted = posted.has(date) || item?.status === "completed";
                const disabled = date >= today || !isAllowed(date) || isPosted || (Boolean(item) && item?.status !== "failed");
                return (
                  <button
                    type="button"
                    key={date}
                    onClick={() => toggle(date)}
                    disabled={disabled}
                    aria-label={`${date}${selectedDate ? ", đã chọn" : ""}`}
                    className={cn(
                      "relative grid aspect-square min-h-10 place-items-center rounded-lg border text-sm transition",
                      selectedDate && "border-primary bg-primary text-primary-foreground",
                      !selectedDate && !disabled && "bg-background hover:border-primary hover:bg-primary/5",
                      disabled && "cursor-not-allowed border-transparent bg-muted/50 text-muted-foreground/45",
                      isPosted && "bg-emerald-50 text-emerald-700",
                      item?.status === "queued" && "bg-amber-50 text-amber-700",
                      item?.status === "processing" && "bg-blue-50 text-blue-700",
                      item?.status === "failed" && "border-red-200 bg-red-50 text-red-700",
                    )}
                  >
                    {day}
                    {(isPosted || item?.status === "queued" || item?.status === "processing" || item?.status === "failed") && (
                      <span className="absolute right-1 top-1">
                        {isPosted ? <Check className="size-3" /> : item?.status === "failed" ? <CircleAlert className="size-3" /> : <Clock3 className="size-3" />}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="mt-5 flex flex-wrap gap-3 text-xs text-muted-foreground">
              <span>✓ Đã đăng</span><span>◷ Đang chờ / xử lý</span><span className="text-red-600">! Lỗi, có thể chọn lại</span>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Search className="size-5 text-primary" />Parent post sẽ tìm</CardTitle></CardHeader>
          <CardContent>
            {previewDate ? (
              <><Badge variant="outline">{previewDate}</Badge><p className="mt-3 break-words rounded-lg bg-muted p-3 font-medium">{renderDateTemplate(titleTemplate, previewDate, effectiveSchedule)}</p></>
            ) : <p className="text-sm text-muted-foreground">Chọn một ngày để xem trước search title.</p>}
            <p className="mt-3 text-xs text-muted-foreground">Nếu chưa tìm thấy parent post chính xác, pipeline hiện tại sẽ tạo post cha rồi mới đăng reply.</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Task riêng cho báo cáo ngày cũ</CardTitle>
            <p className="text-sm leading-6 text-muted-foreground">Bộ task này được lưu trong queue và hoàn toàn không đọc hoặc cập nhật task báo cáo hằng ngày. Tiến độ bắt đầu sẽ được cộng mức tăng ở lần post đầu tiên.</p>
          </CardHeader>
          <CardContent className="space-y-4">
            {tasks.map((task, index) => (
              <article key={task.id} className="rounded-xl border bg-muted/20 p-4">
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-sm font-semibold text-primary">{index + 1}</span>
                  <label className="min-w-0 flex-1 text-sm font-medium">Tên task
                    <input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} maxLength={500} placeholder="Nhập tên task mới" className="mt-2 h-10 w-full rounded-lg border bg-background px-3 outline-none focus:border-primary" />
                  </label>
                  <button type="button" onClick={() => setTasks((current) => current.filter((_, taskIndex) => taskIndex !== index))} className="mt-7 rounded-lg px-3 py-2 text-red-600 hover:bg-red-50" aria-label="Xóa task">×</button>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  <NumberInput label="Tiến độ bắt đầu" value={task.startPercent} onChange={(value) => updateTask(index, { startPercent: value })} />
                  <NumberInput label="Tiến độ tối đa" value={task.maxPercent} onChange={(value) => updateTask(index, { maxPercent: value })} />
                  {task.dailyIncreaseRange === null ? (
                    <NumberInput label="Tăng mỗi lần post" value={task.dailyIncrease ?? 0} onChange={(value) => updateTask(index, { dailyIncrease: value })} />
                  ) : (
                    <label className="text-sm font-medium">Khoảng tăng
                      <div className="mt-2 flex items-center gap-1">
                        <input aria-label="Mức tăng tối thiểu" type="number" min={0} max={100} value={task.dailyIncreaseRange[0]} onChange={(event) => updateTask(index, { dailyIncreaseRange: [Number(event.target.value), task.dailyIncreaseRange?.[1] ?? 0] })} className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2" />
                        <span>–</span>
                        <input aria-label="Mức tăng tối đa" type="number" min={0} max={100} value={task.dailyIncreaseRange[1]} onChange={(event) => updateTask(index, { dailyIncreaseRange: [task.dailyIncreaseRange?.[0] ?? 0, Number(event.target.value)] })} className="h-10 min-w-0 flex-1 rounded-lg border bg-background px-2" />
                      </div>
                    </label>
                  )}
                </div>
                <div className="mt-4 flex items-center gap-3 rounded-lg bg-background p-3 text-sm">
                  <span className={task.dailyIncreaseRange === null ? "font-medium text-primary" : "text-muted-foreground"}>Cố định</span>
                  <Switch checked={task.dailyIncreaseRange !== null} onCheckedChange={(checked) => setIncreaseMode(index, checked)} aria-label="Chọn cách tăng tiến độ" />
                  <span className={task.dailyIncreaseRange !== null ? "font-medium text-primary" : "text-muted-foreground"}>Ngẫu nhiên</span>
                </div>
              </article>
            ))}
            <Button type="button" variant="outline" onClick={() => setTasks((current) => [...current, newBackfillTask()])}>+ Thêm task mới</Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-3 rounded-xl border bg-white p-4 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">{selected.length} ngày · {tasks.length} task mới</p><p className="text-xs text-muted-foreground">Queue xử lý theo ngày cũ nhất và truyền tiến độ task trong cùng batch.</p></div>
          <Button onClick={enqueue} disabled={!selected.length || !tasksAreValid || submitting}>{submitting ? <LoaderCircle className="animate-spin" /> : <CalendarDays />}Thêm vào queue</Button>
        </div>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader><CardTitle>Queue báo cáo</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            {!queue.length && <p className="text-sm text-muted-foreground">Queue chưa có báo cáo nào.</p>}
            {queue.slice(0, 12).map((item) => (
              <div key={item.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between gap-3"><span className="font-medium">{item.date}</span><QueueBadge status={item.status} /></div>
                <p className="mt-2 line-clamp-2 text-xs text-muted-foreground">{item.title}</p>
                <p className="mt-2 text-xs text-muted-foreground">{item.tasks.length} task riêng{item.tasks[0] ? ` · ${item.tasks[0].startPercent}%` : ""}</p>
                {item.error && <p className="mt-2 text-xs text-red-600">{item.error}</p>}
              </div>
            ))}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}

function NumberInput({ label, value, onChange }: { label: string; value: number; onChange: (value: number) => void }) {
  return <label className="text-sm font-medium">{label}<input type="number" min={0} max={100} value={value} onChange={(event) => onChange(Number(event.target.value))} className="mt-2 h-10 w-full rounded-lg border bg-background px-3 outline-none focus:border-primary" /></label>;
}

function QueueBadge({ status }: { status: ReportQueueItem["status"] }) {
  const labels = { queued: "Đang chờ", processing: "Đang xử lý", completed: "Đã đăng", failed: "Lỗi" };
  return <Badge variant={status === "completed" ? "default" : status === "failed" ? "destructive" : "secondary"}>{labels[status]}</Badge>;
}

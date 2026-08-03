"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { createClientUuid } from "@/lib/client-id";

type EditableTask = {
  id: string;
  title: string;
  startPercent: number;
  dailyIncrease: number | null;
  dailyIncreaseRange: [number, number] | null;
  maxPercent: number;
};

export function TaskEditor({ memberId, initialVersion, initialTasks, initialExcludeCompletedTasks }: {
  memberId: string;
  initialVersion: number;
  initialTasks: EditableTask[];
  initialExcludeCompletedTasks: boolean;
}) {
  const [tasks, setTasks] = useState(initialTasks);
  const [excludeCompletedTasks, setExcludeCompletedTasks] = useState(initialExcludeCompletedTasks);
  const [version, setVersion] = useState(initialVersion);
  const [status, setStatus] = useState<"idle" | "saving">("idle");

  function updateTask(index: number, changes: Partial<EditableTask>) {
    setTasks((current) => current.map((task, taskIndex) => taskIndex === index ? { ...task, ...changes } : task));
    setStatus("idle");
  }

  function move(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= tasks.length) return;
    setTasks((current) => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setStatus("idle");
  }

  function setIncreaseMode(index: number, mode: "fixed" | "random") {
    const task = tasks[index];
    if (mode === "random") {
      const value = task.dailyIncrease ?? task.dailyIncreaseRange?.[0] ?? 5;
      updateTask(index, { dailyIncrease: null, dailyIncreaseRange: [value, value] });
    } else {
      updateTask(index, { dailyIncrease: task.dailyIncreaseRange?.[0] ?? task.dailyIncrease ?? 5, dailyIncreaseRange: null });
    }
  }

  async function save() {
    setStatus("saving");
    const response = await fetch(`/api/members/${memberId}/tasks`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        expectedVersion: version,
        excludeCompletedTasks,
        tasks: tasks.map((task) => ({
          id: task.id,
          title: task.title,
          startPercent: task.startPercent,
          maxPercent: task.maxPercent,
          ...(task.dailyIncrease === null ? {} : { dailyIncrease: task.dailyIncrease }),
          ...(task.dailyIncreaseRange === null ? {} : { dailyIncreaseRange: task.dailyIncreaseRange }),
        })),
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus("idle");
      toast.error("Không thể lưu task", { description: response.status === 409 ? "Dữ liệu đã được cập nhật ở nơi khác. Hãy tải lại trang." : "Kiểm tra dữ liệu và thử lại." });
      return;
    }
    setVersion(result.member.version);
    setStatus("idle");
    toast.success("Đã lưu thay đổi task");
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_8px_30px_rgba(24,55,39,0.04)] sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-semibold text-[#26372e]">Ẩn task đã hoàn thành khỏi báo cáo</p>
          <p className="mt-1 text-sm leading-6 text-[#718078]">Khi bật, task có tiến độ hiện tại đạt 100% sẽ không xuất hiện trong daily report nhưng vẫn được giữ và hiển thị tại trang này.</p>
        </div>
        <Switch checked={excludeCompletedTasks} onCheckedChange={(checked) => { setExcludeCompletedTasks(checked); setStatus("idle"); }} aria-label="Ẩn task đạt 100 phần trăm khỏi báo cáo" className="shrink-0" />
      </div>

      {tasks.map((task, index) => (
        <article key={task.id} className="rounded-2xl border border-black/[0.06] bg-white p-5 shadow-[0_8px_30px_rgba(24,55,39,0.04)]">
          <div className="mb-5 grid grid-cols-[auto_1fr] items-start gap-3 sm:flex">
            <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[#e8f4ed] text-sm font-semibold text-[#176b4a]">{index + 1}</span>
            <label className="min-w-0 flex-1 text-sm font-medium">Tên task<input value={task.title} onChange={(event) => updateTask(index, { title: event.target.value })} maxLength={500} required className="mt-2 h-10 w-full min-w-0 rounded-xl border border-[#d9e2dc] px-3 outline-none focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /></label>
            <div className="col-span-2 flex justify-end gap-1 sm:col-span-1"><button type="button" onClick={() => move(index, -1)} disabled={index === 0} className="rounded-lg px-3 py-1 text-[#718078] hover:bg-[#eef3f0] disabled:opacity-30" aria-label="Đưa task lên">↑</button><button type="button" onClick={() => move(index, 1)} disabled={index === tasks.length - 1} className="rounded-lg px-3 py-1 text-[#718078] hover:bg-[#eef3f0] disabled:opacity-30" aria-label="Đưa task xuống">↓</button><button type="button" onClick={() => { setTasks(tasks.filter((_, i) => i !== index)); setStatus("idle"); }} className="rounded-lg px-3 py-1 text-red-500 hover:bg-red-50" aria-label="Xóa task">×</button></div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <NumberField label="Tiến độ hiện tại" value={task.startPercent} onChange={(value) => updateTask(index, { startPercent: value ?? 0 })} />
            <NumberField label="Tiến độ tối đa" value={task.maxPercent} onChange={(value) => updateTask(index, { maxPercent: value ?? 100 })} />
            <div className="sm:col-span-2">
              <p className="text-sm font-medium">Cách tăng tiến độ mỗi ngày</p>
              <div className="mt-2 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 rounded-xl bg-[#f3f7f4] px-3 py-3 sm:px-4">
                <span className={`text-sm font-medium ${task.dailyIncreaseRange === null ? "text-[#176b4a]" : "text-[#87948d]"}`}>Cố định</span>
                <Switch checked={task.dailyIncreaseRange !== null} onCheckedChange={(checked) => setIncreaseMode(index, checked ? "random" : "fixed")} aria-label="Chuyển chế độ tăng tiến độ" />
                <span className={`text-right text-sm font-medium leading-5 ${task.dailyIncreaseRange !== null ? "text-[#176b4a]" : "text-[#87948d]"}`}>Ngẫu nhiên trong khoảng</span>
              </div>
              <div className="mt-4 max-w-md">
                {task.dailyIncreaseRange === null ? (
                  <NumberField label="Mức tăng cố định" value={task.dailyIncrease ?? ""} onChange={(value) => updateTask(index, { dailyIncrease: value ?? 0, dailyIncreaseRange: null })} />
                ) : (
                  <label className="text-sm font-medium">Khoảng tăng ngẫu nhiên<div className="mt-2 flex items-center gap-2"><input aria-label="Mức tăng tối thiểu" type="number" min={0} max={100} required value={task.dailyIncreaseRange[0]} onChange={(event) => updateTask(index, { dailyIncrease: null, dailyIncreaseRange: [Number(event.target.value), task.dailyIncreaseRange?.[1] ?? Number(event.target.value)] })} className="h-10 w-full rounded-xl border border-[#d9e2dc] px-3 outline-none focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /><span className="text-[#87948d]">–</span><input aria-label="Mức tăng tối đa" type="number" min={0} max={100} required value={task.dailyIncreaseRange[1]} onChange={(event) => updateTask(index, { dailyIncrease: null, dailyIncreaseRange: [task.dailyIncreaseRange?.[0] ?? Number(event.target.value), Number(event.target.value)] })} className="h-10 w-full rounded-xl border border-[#d9e2dc] px-3 outline-none focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /></div><span className="mt-1.5 block text-xs text-[#87948d]">Mỗi ngày hệ thống chọn ngẫu nhiên một giá trị trong khoảng này.</span></label>
                )}
              </div>
            </div>
          </div>
        </article>
      ))}

      <div className="grid grid-cols-2 gap-3 sm:flex sm:items-center sm:justify-between">
        <button type="button" onClick={() => { setTasks([...tasks, { id: `task_${createClientUuid()}`, title: "", startPercent: 0, dailyIncrease: 5, dailyIncreaseRange: null, maxPercent: 100 }]); setStatus("idle"); }} className="rounded-xl border border-[#cfdad3] bg-white px-3 py-2.5 text-sm font-semibold text-[#176b4a] hover:bg-[#f6faf8] sm:px-4">+ Thêm task</button>
        <button type="button" onClick={save} disabled={status === "saving" || tasks.some((task) => !task.title.trim())} className="rounded-xl bg-[#176b4a] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#11583d] disabled:cursor-not-allowed disabled:opacity-50 sm:px-5">{status === "saving" ? "Đang lưu…" : "Lưu thay đổi"}</button>
      </div>
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: number | ""; onChange: (value: number | null) => void }) {
  return <label className="text-sm font-medium">{label}<input type="number" min={0} max={100} value={value} required onChange={(event) => onChange(event.target.value === "" ? null : Number(event.target.value))} className="mt-2 h-10 w-full rounded-xl border border-[#d9e2dc] px-3 outline-none focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /></label>;
}

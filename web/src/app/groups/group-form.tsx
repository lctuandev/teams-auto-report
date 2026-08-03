"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CalendarDays, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Group } from "@/lib/schemas/group";
import { availableVietnamHolidayYears, getVietnamHolidayCalendar, mergeVietnamHolidayCalendar } from "@/lib/vietnam-holidays";

type Fields = Pick<Group, "name" | "teams" | "parentPost">;
export function GroupForm({ mode, groupId: initialId, version, initial }: { mode: "create" | "edit"; groupId?: string; version?: number; initial: Fields }) {
  const router = useRouter();
  const [groupId, setGroupId] = useState(initialId ?? "");
  const [fields, setFields] = useState(initial);
  const holidayYears = availableVietnamHolidayYears();
  const [holidayYear, setHolidayYear] = useState(holidayYears.at(-1) ?? new Date().getFullYear());
  const [status, setStatus] = useState<"idle" | "saving">("idle");
  const preview = useMemo(() => renderDate(fields.parentPost.searchTitleTemplate), [fields.parentPost.searchTitleTemplate]);
  const updateParent = (value: Partial<Fields["parentPost"]>) => setFields({ ...fields, parentPost: { ...fields.parentPost, ...value } });
  const holidayCalendar = getVietnamHolidayCalendar(holidayYear);

  function applyVietnamHolidays() {
    if (!holidayCalendar) return;
    updateParent(mergeVietnamHolidayCalendar(fields.parentPost, holidayCalendar));
  }

  function addDate(type: "skipDates" | "extraWorkDates", date: string) {
    if (!date) return;
    const opposite = type === "skipDates" ? "extraWorkDates" : "skipDates";
    updateParent({
      [type]: [...new Set([...fields.parentPost[type], date])].sort(),
      [opposite]: fields.parentPost[opposite].filter((item) => item !== date),
    });
  }

  async function save() {
    setStatus("saving");
    const response = await fetch(mode === "create" ? "/api/groups" : `/api/groups/${groupId}`, { method: mode === "create" ? "POST" : "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ ...(mode === "create" ? { id: groupId } : { expectedVersion: version }), ...fields }) });
    if (!response.ok) {
      setStatus("idle");
      toast.error("Không thể lưu group", { description: response.status === 409 ? "Group đã thay đổi hoặc ID đã tồn tại. Hãy tải lại hoặc đổi ID." : "Kiểm tra dữ liệu bắt buộc và thử lại." });
      return;
    }
    toast.success(mode === "create" ? "Đã tạo group" : "Đã lưu group", { description: fields.name });
    router.push("/groups"); router.refresh();
  }

  async function disable() {
    if (!window.confirm("Tắt group này? Group đang được member sử dụng sẽ không thể tắt.")) return;
    setStatus("saving");
    const response = await fetch(`/api/groups/${groupId}?expectedVersion=${version}`, { method: "DELETE" });
    if (!response.ok) {
      setStatus("idle");
      toast.error("Không thể tắt group", { description: response.status === 409 ? "Group đã thay đổi hoặc vẫn đang được member sử dụng." : "Hãy thử lại sau." });
      return;
    }
    toast.success("Đã tắt group", { description: fields.name });
    router.push("/groups"); router.refresh();
  }

  return <div className="space-y-5">
    <Card><CardHeader><CardTitle>Thông tin chung</CardTitle></CardHeader><CardContent className="grid gap-5 sm:grid-cols-2">{mode === "create" && <Field label="Group ID"><Input value={groupId} onChange={(e) => setGroupId(e.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, "_"))} placeholder="advance_uav_navigation" /></Field>}<Field label="Tên group"><Input value={fields.name} onChange={(e) => setFields({ ...fields, name: e.target.value })} /></Field></CardContent></Card>
    <Card><CardHeader><CardTitle>Teams target</CardTitle></CardHeader><CardContent className="grid gap-5"><Field label="Thread ID"><Input value={fields.teams.threadId} onChange={(e) => setFields({ ...fields, teams: { ...fields.teams, threadId: e.target.value } })} /></Field><Field label="Team ID"><Input value={fields.teams.teamId} onChange={(e) => setFields({ ...fields, teams: { ...fields.teams, teamId: e.target.value } })} /></Field><Field label="Conversation link prefix"><Input type="url" value={fields.teams.conversationLinkPrefix} onChange={(e) => setFields({ ...fields, teams: { ...fields.teams, conversationLinkPrefix: e.target.value } })} /></Field></CardContent></Card>
    <Card><CardHeader><CardTitle>Parent post</CardTitle></CardHeader><CardContent className="grid gap-5"><Field label="Title template"><Input value={fields.parentPost.searchTitleTemplate} onChange={(e) => updateParent({ searchTitleTemplate: e.target.value })} /></Field><Field label="HTML content template"><Textarea className="min-h-32 font-mono text-xs" value={fields.parentPost.contentTemplate} onChange={(e) => updateParent({ contentTemplate: e.target.value })} /></Field><div className="grid gap-5 sm:grid-cols-2"><Field label="Timezone"><Input value={fields.parentPost.timezone} onChange={(e) => updateParent({ timezone: e.target.value })} /></Field><Field label="Giờ tạo parent"><Input type="time" value={fields.parentPost.postAfterTime} onChange={(e) => updateParent({ postAfterTime: e.target.value })} /></Field></div><div><Label>Ngày đăng</Label><div className="mt-3 flex flex-wrap gap-3">{[0,1,2,3,4,5,6].map((day) => <label key={day} className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm"><Checkbox checked={fields.parentPost.days.includes(day)} onCheckedChange={(checked) => updateParent({ days: checked ? [...fields.parentPost.days, day].sort() : fields.parentPost.days.filter((value) => value !== day) })} />{["CN","T2","T3","T4","T5","T6","T7"][day]}</label>)}</div></div><section className="rounded-xl border bg-muted/25 p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><h3 className="flex items-center gap-2 text-sm font-semibold"><CalendarDays className="size-4 text-primary" />Lịch nghỉ lễ Việt Nam</h3><p className="mt-1 text-xs leading-5 text-muted-foreground">Tự thêm ngày nghỉ và ngày làm bù theo lịch hành chính đã công bố. Doanh nghiệp có thể điều chỉnh lại bằng lịch bên dưới.</p></div><div className="flex flex-col gap-2 sm:flex-row"><select value={holidayYear} onChange={(event) => setHolidayYear(Number(event.target.value))} className="h-10 rounded-lg border bg-background px-3 text-sm">{holidayYears.map((year) => <option key={year} value={year}>{year}</option>)}</select><Button type="button" variant="outline" onClick={applyVietnamHolidays} disabled={!holidayCalendar}><CalendarDays />Áp dụng lịch Việt Nam</Button></div></div>{holidayCalendar && <div className="mt-4 rounded-lg bg-background px-3 py-3 text-xs text-muted-foreground"><p className="font-medium text-foreground">{holidayCalendar.label}</p><p className="mt-1">{holidayCalendar.holidays.map((holiday) => `${holiday.name}: ${holiday.dates.map(formatDate).join(", ")}`).join(" · ")}</p><a href={holidayCalendar.sourceUrl} target="_blank" rel="noreferrer" className="mt-2 inline-block font-medium text-primary hover:underline">Nguồn: Báo Điện tử Chính phủ</a></div>}</section><div className="grid gap-5 lg:grid-cols-2"><DateListPicker label="Ngày nghỉ" dates={fields.parentPost.skipDates} onAdd={(date) => addDate("skipDates", date)} onRemove={(date) => updateParent({ skipDates: fields.parentPost.skipDates.filter((item) => item !== date) })} /><DateListPicker label="Ngày làm bù" dates={fields.parentPost.extraWorkDates} onAdd={(date) => addDate("extraWorkDates", date)} onRemove={(date) => updateParent({ extraWorkDates: fields.parentPost.extraWorkDates.filter((item) => item !== date) })} /></div></CardContent></Card>
    <Card><CardHeader><CardTitle>Preview an toàn</CardTitle></CardHeader><CardContent><p className="mb-3 font-semibold">{preview}</p><iframe title="Parent post preview" sandbox="" srcDoc={fields.parentPost.contentTemplate} className="h-40 w-full rounded-xl border bg-white" /></CardContent></Card>
    <div className="sticky bottom-3 flex flex-col-reverse gap-2 rounded-2xl border bg-background/90 p-3 shadow-lg backdrop-blur sm:flex-row sm:justify-end">{mode === "edit" && <Button variant="destructive" onClick={disable} disabled={status === "saving"}>Tắt group</Button>}<Button onClick={save} disabled={status === "saving" || !groupId || !fields.name.trim()}>{status === "saving" ? "Đang lưu…" : mode === "create" ? "Tạo group" : "Lưu group"}</Button></div>
  </div>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) { return <div className="min-w-0 space-y-2"><Label>{label}</Label>{children}</div>; }
function DateListPicker({ label, dates, onAdd, onRemove }: { label: string; dates: string[]; onAdd: (date: string) => void; onRemove: (date: string) => void }) {
  const [selectedDate, setSelectedDate] = useState("");
  return <div className="min-w-0 rounded-xl border p-4"><Label>{label}</Label><div className="mt-2 flex gap-2"><Input type="date" value={selectedDate} onChange={(event) => setSelectedDate(event.target.value)} /><Button type="button" variant="outline" size="icon" aria-label={`Thêm ${label.toLowerCase()}`} disabled={!selectedDate} onClick={() => { onAdd(selectedDate); setSelectedDate(""); }}><Plus /></Button></div><div className="mt-3 flex min-h-8 flex-wrap gap-2">{dates.length ? dates.map((date) => <span key={date} className="inline-flex items-center gap-1 rounded-full border bg-background py-1 pl-3 pr-1 text-xs"><span>{formatDate(date)}</span><button type="button" onClick={() => onRemove(date)} aria-label={`Xóa ${date}`} className="grid size-6 place-items-center rounded-full text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3.5" /></button></span>) : <span className="text-xs text-muted-foreground">Chưa chọn ngày nào.</span>}</div></div>;
}
function formatDate(date: string) { const [year, month, day] = date.split("-"); return `${day}/${month}/${year}`; }
function renderDate(template: string) { const now = new Date(); const dd = String(now.getDate()).padStart(2, "0"); const mm = String(now.getMonth() + 1).padStart(2, "0"); return template.replaceAll("{DD}", dd).replaceAll("{MM}", mm).replaceAll("{YYYY}", String(now.getFullYear())); }

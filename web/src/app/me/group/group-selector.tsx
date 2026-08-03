"use client";
import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import type { Group } from "@/lib/schemas/group";

export function GroupSelector({ memberId, version, currentGroupId, groups, hasReportToday }: { memberId: string; version: number; currentGroupId: string | null; groups: Group[]; hasReportToday: boolean }) {
  const router = useRouter(); const [selected, setSelected] = useState(currentGroupId); const [status, setStatus] = useState<"idle"|"saving">("idle");
  async function save() { if (!selected || selected === currentGroupId) return; if (hasReportToday && !window.confirm("Hôm nay đã có report. Bạn vẫn muốn chuyển group?")) return; setStatus("saving"); const response = await fetch(`/api/members/${memberId}/group`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ groupId: selected, expectedVersion: version }) }); if (!response.ok) { setStatus("idle"); toast.error("Không thể chuyển group", { description: response.status === 409 ? "Dữ liệu member đã thay đổi. Hãy tải lại trang." : "Hãy thử lại sau." }); return; } toast.success("Đã chuyển group"); router.push("/"); router.refresh(); }
  return <div className="space-y-4"><div className="grid gap-4 md:grid-cols-2">{groups.filter((group) => group.enabled).map((group) => <button key={group.id} type="button" onClick={() => { setSelected(group.id); setStatus("idle"); }} className="text-left"><Card className={cn("h-full transition", selected === group.id && "border-primary ring-2 ring-primary/15")}><CardContent className="p-5"><h2 className="font-semibold">{group.name}</h2><p className="mt-1 break-all text-xs text-muted-foreground">{group.id}</p><div className="mt-4 grid grid-cols-2 gap-3 text-xs"><span>Parent: <strong>{group.parentPost.postAfterTime}</strong></span><span>{group.parentPost.timezone}</span></div><p className="mt-4 line-clamp-2 text-sm text-muted-foreground">{group.parentPost.searchTitleTemplate}</p></CardContent></Card></button>)}</div><div className="sticky bottom-3 flex justify-end rounded-2xl border bg-background/90 p-3 shadow-lg backdrop-blur"><Button className="w-full sm:w-auto" onClick={save} disabled={!selected || selected === currentGroupId || status === "saving"}>{status === "saving" ? "Đang chuyển…" : "Chọn group"}</Button></div></div>;
}

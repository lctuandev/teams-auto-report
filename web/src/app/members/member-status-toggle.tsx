"use client";

import { useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { LoaderCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";

export function MemberStatusToggle({
  memberId,
  enabled,
  version,
}: {
  memberId: string;
  enabled: boolean;
  version: number;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function update(nextEnabled: boolean) {
    const action = nextEnabled ? "bật lại đăng nhập Web và báo cáo bot" : "tắt đăng nhập Web và báo cáo bot";
    if (!window.confirm(`Xác nhận ${action} cho ${memberId}?`)) return;
    setSaving(true);
    const response = await fetch(`/api/admin/accounts/${memberId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: nextEnabled, expectedVersion: version }),
    });
    const result = await response.json();
    setSaving(false);
    if (!response.ok) {
      toast.error("Không thể cập nhật user", { description: response.status === 409 ? "Dữ liệu đã thay đổi. Hãy tải lại trang." : result.error });
      return;
    }
    toast.success(nextEnabled ? "Đã bật user" : "Đã tắt user", { description: memberId });
    router.refresh();
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-1" onClick={(event) => event.preventDefault()}>
      <div className="flex items-center gap-2">
        {saving && <LoaderCircle className="size-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={enabled}
          disabled={saving}
          aria-label={`${enabled ? "Tắt" : "Bật"} user ${memberId}`}
          onCheckedChange={update}
        />
        <span className="text-xs font-medium">{enabled ? "Đang bật" : "Đã tắt"}</span>
      </div>
    </div>
  );
}

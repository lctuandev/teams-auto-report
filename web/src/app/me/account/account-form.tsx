"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { KeyRound, LoaderCircle, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function AccountForm({ currentUsername }: { currentUsername: string }) {
  const router = useRouter();
  const [username, setUsername] = useState(currentUsername);
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (newPassword && newPassword !== confirmPassword) {
      toast.error("Mật khẩu mới nhập lại không khớp");
      return;
    }
    setStatus("saving");
    const response = await fetch("/api/account", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ username, currentPassword, newPassword: newPassword || undefined, confirmPassword: confirmPassword || undefined }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStatus("idle");
      toast.error(result.error === "Invalid current password" ? "Mật khẩu hiện tại không đúng" : result.error === "Username already exists" ? "Tên đăng nhập đã được sử dụng" : result.error === "No account changes" ? "Bạn chưa thay đổi tài khoản" : "Không thể cập nhật tài khoản");
      return;
    }
    toast.success("Đã cập nhật tài khoản", { description: "Vui lòng đăng nhập lại." });
    router.replace("/login?account=updated");
    router.refresh();
  }

  return (
    <form onSubmit={submit}>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><UserRound className="size-5" />Thông tin đăng nhập</CardTitle></CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2"><Label htmlFor="username">Tên đăng nhập mới</Label><Input id="username" value={username} onChange={(event) => setUsername(event.target.value.toLowerCase())} pattern="[a-z0-9_-]{1,80}" maxLength={80} autoComplete="username" required className="h-11" /><p className="text-xs text-muted-foreground">Dùng chữ thường, số, dấu gạch dưới hoặc gạch ngang.</p></div>
          <div className="space-y-2"><Label htmlFor="current-password">Mật khẩu hiện tại</Label><Input id="current-password" type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} autoComplete="current-password" maxLength={200} required className="h-11" /></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <div className="space-y-2"><Label htmlFor="new-password">Mật khẩu mới</Label><Input id="new-password" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" minLength={6} maxLength={200} className="h-11" /><p className="text-xs text-muted-foreground">Để trống nếu chỉ đổi username.</p></div>
            <div className="space-y-2"><Label htmlFor="confirm-password">Nhập lại mật khẩu mới</Label><Input id="confirm-password" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" minLength={newPassword ? 6 : undefined} maxLength={200} className="h-11" /></div>
          </div>
          <div className="flex flex-col-reverse gap-3 border-t pt-5 sm:flex-row sm:items-center sm:justify-between"><p className="text-xs text-muted-foreground">ID dữ liệu và folder member không thay đổi.</p><Button type="submit" size="lg" disabled={status === "saving"} className="h-11 w-full sm:w-auto">{status === "saving" ? <LoaderCircle className="animate-spin" /> : <KeyRound />}{status === "saving" ? "Đang lưu…" : "Lưu và đăng nhập lại"}</Button></div>
        </CardContent>
      </Card>
    </form>
  );
}

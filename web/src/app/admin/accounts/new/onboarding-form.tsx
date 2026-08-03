"use client";

import { FormEvent, useState } from "react";
import { toast } from "sonner";
import {
  CheckCircle2,
  Copy,
  LoaderCircle,
  Trash2,
  UserPlus,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { displayNameToMemberId } from "@/lib/member-id";

type GroupOption = { id: string; name: string };
export function OnboardingForm({ groups }: { groups: GroupOption[] }) {
  const [username, setUsername] = useState("");
  const [usernameTouched, setUsernameTouched] = useState(false);
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [groupId, setGroupId] = useState(groups[0]?.id ?? "");
  const [postAfterTime, setPostAfterTime] = useState("17:30");
  const [randomWindow, setRandomWindow] = useState(10);
  const [step, setStep] = useState<
    "create" | "creating" | "onboard" | "onboarding" | "done"
  >("create");
  const [copyPaths, setCopyPaths] = useState<string[]>([]);
  const [createdMemberId, setCreatedMemberId] = useState("");
  const [deleting, setDeleting] = useState(false);
  const memberId = displayNameToMemberId(displayName);

  async function create(event: FormEvent) {
    event.preventDefault();
    setStep("creating");
    const response = await fetch("/api/admin/accounts", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        username,
        password,
        displayName,
        groupId,
        postAfterTime,
        postAfterRandomWindowMinutes: randomWindow,
      }),
    });
    const result = await response.json();
    if (!response.ok) {
      setStep("create");
      toast.error("Không thể tạo account", { description: result.error });
      return;
    }
    setCreatedMemberId(result.memberId);
    setStep("onboard");
    toast.success("Đã tạo account", { description: result.memberId });
  }

  async function onboard() {
    setStep("onboarding");
    const response = await fetch(
      `/api/admin/accounts/${createdMemberId}/onboard`,
      { method: "POST" },
    );
    const result = await response.json();
    if (!response.ok) {
      setStep("onboard");
      toast.error("Browser onboarding thất bại", { description: result.error });
      return;
    }
    setCopyPaths(result.copyPaths);
    setStep("done");
    toast.success("Onboarding Teams hoàn tất");
  }

  async function removeCreatedAccount() {
    const confirmation = window.prompt(
      `Nhập chính xác Member ID "${createdMemberId}" để xóa account, browser profile và lock liên quan:`,
    );
    if (confirmation !== createdMemberId) {
      if (confirmation !== null) toast.error("Member ID xác nhận không khớp");
      return;
    }
    setDeleting(true);
    const response = await fetch(`/api/admin/accounts/${createdMemberId}`, {
      method: "DELETE",
      headers: { "x-confirm-member-id": confirmation },
    });
    const result = await response.json();
    setDeleting(false);
    if (!response.ok) {
      toast.error("Không thể xóa account", { description: result.error });
      return;
    }
    setUsername("");
    setUsernameTouched(false);
    setPassword("");
    setDisplayName("");
    setCreatedMemberId("");
    setCopyPaths([]);
    setStep("create");
    toast.success("Đã xóa account onboarding", { description: confirmation });
  }

  if (step === "done")
    return (
      <Card className="border-emerald-200">
        <CardContent className="p-6 md:p-8">
          <CheckCircle2 className="size-10 text-emerald-600" />
          <h2 className="mt-4 text-xl font-semibold">Onboarding hoàn tất</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Copy cả hai đường dẫn sau lên đúng vị trí tương ứng trên server:
          </p>
          <div className="mt-5 space-y-2">
            {copyPaths.map((value) => (
              <div
                key={value}
                className="flex items-center justify-between gap-3 rounded-xl border bg-muted/40 px-4 py-3 font-mono text-sm"
              >
                <span className="break-all">{value}</span>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    navigator.clipboard.writeText(value);
                    toast.success("Đã sao chép đường dẫn");
                  }}
                >
                  <Copy />
                </Button>
              </div>
            ))}
          </div>
          <p className="mt-5 text-xs leading-5 text-muted-foreground">
            Server cần Chrome/Playwright và browser profile này để renew
            headless khi token hết hạn.
          </p>
          <div className="mt-6 flex justify-end border-t pt-5">
            <Button
              type="button"
              variant="destructive"
              onClick={removeCreatedAccount}
              disabled={deleting}
            >
              {deleting ? (
                <LoaderCircle className="animate-spin" />
              ) : (
                <Trash2 />
              )}
              {deleting ? "Đang xóa…" : "Xóa account vừa tạo"}
            </Button>
          </div>
        </CardContent>
      </Card>
    );

  return (
    <form onSubmit={create}>
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="size-5" />
            Thông tin account
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Tên hiển thị">
              <Input
                value={displayName}
                onChange={(event) => {
                  const value = event.target.value;
                  setDisplayName(value);
                  if (!usernameTouched)
                    setUsername(displayNameToMemberId(value));
                }}
                required
                disabled={step !== "create"}
                className="h-11"
              />
            </Field>
            <Field label="Member ID (tự động)">
              <Input
                value={createdMemberId || memberId}
                readOnly
                tabIndex={-1}
                className="h-11 bg-muted font-mono text-muted-foreground"
              />
              <p className="text-xs text-muted-foreground">
                Tự sinh từ tên hiển thị và không thể chỉnh sửa.
              </p>
            </Field>
            <Field label="Username">
              <Input
                value={username}
                onChange={(event) => {
                  setUsernameTouched(true);
                  setUsername(event.target.value.toLowerCase());
                }}
                pattern="[a-z0-9_-]{1,80}"
                required
                disabled={step !== "create"}
                className="h-11"
              />
            </Field>
            <Field label="Mật khẩu ban đầu">
              <Input
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                minLength={6}
                required
                disabled={step !== "create"}
                className="h-11"
              />
            </Field>
            <Field label="Group">
              <select
                value={groupId}
                onChange={(event) => setGroupId(event.target.value)}
                disabled={step !== "create"}
                className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
              >
                {groups.map((group) => (
                  <option key={group.id} value={group.id}>
                    {group.name}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Giờ reply">
              <Input
                type="time"
                value={postAfterTime}
                onChange={(event) => setPostAfterTime(event.target.value)}
                required
                disabled={step !== "create"}
                className="h-11"
              />
            </Field>
            <Field label="Random window (phút)">
              <Input
                type="number"
                min={0}
                max={240}
                value={randomWindow}
                onChange={(event) =>
                  setRandomWindow(Number(event.target.value))
                }
                disabled={step !== "create"}
                className="h-11"
              />
            </Field>
          </div>
          <div className="flex flex-col-reverse justify-end gap-3 border-t pt-5 sm:flex-row">
            {step !== "create" && step !== "creating" && (
              <Button
                type="button"
                variant="destructive"
                onClick={removeCreatedAccount}
                disabled={step === "onboarding" || deleting}
              >
                {deleting ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <Trash2 />
                )}
                {deleting ? "Đang xóa…" : "Xóa account vừa tạo"}
              </Button>
            )}
            {step === "create" || step === "creating" ? (
              <Button
                type="submit"
                size="lg"
                disabled={step === "creating" || !groups.length || !memberId}
              >
                {step === "creating" ? (
                  <LoaderCircle className="animate-spin" />
                ) : (
                  <UserPlus />
                )}
                {step === "creating" ? "Đang tạo…" : "Tạo account"}
              </Button>
            ) : (
              <Button
                type="button"
                size="lg"
                onClick={onboard}
                disabled={step === "onboarding"}
              >
                {step === "onboarding" && (
                  <LoaderCircle className="animate-spin" />
                )}
                {step === "onboarding"
                  ? "Đang chờ browser login…"
                  : "Mở browser để đăng nhập Teams"}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

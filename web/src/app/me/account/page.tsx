import { AppShell } from "@/components/app-shell";
import { requireSession } from "@/lib/auth/session";
import { AccountForm } from "./account-form";

export default async function AccountPage() {
  const session = await requireSession();
  return (
    <AppShell session={session}>
      <main className="mx-auto w-full max-w-3xl px-5 py-10 md:px-10">
        <div className="mb-8">
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-primary">Cá nhân</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Tài khoản</h1>
          <p className="mt-3 text-sm leading-6 text-muted-foreground">Thay đổi tên đăng nhập hoặc mật khẩu. Bạn sẽ được đăng xuất sau khi lưu thành công.</p>
        </div>
        <AccountForm currentUsername={session.username} />
      </main>
    </AppShell>
  );
}

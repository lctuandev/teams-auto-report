import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";
import { login } from "./actions";

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getSession()) redirect("/");
  const { error, account } = await searchParams;

  return (
    <main className="grid min-h-screen place-items-center bg-[#f1f6f3] px-5 py-12 text-[#17231d]">
      <section className="w-full max-w-md rounded-3xl border border-black/[0.06] bg-white p-7 shadow-[0_24px_80px_rgba(24,55,39,0.10)] md:p-9">
        <div className="mb-8 flex items-center gap-3"><div className="grid size-11 place-items-center rounded-xl bg-[#176b4a] text-lg font-bold text-white">T</div><div><h1 className="font-semibold">Teams Auto Report</h1><p className="text-xs text-[#718078]">Đăng nhập workspace</p></div></div>
        <h2 className="text-2xl font-semibold tracking-tight">Chào mừng trở lại</h2>
        <p className="mt-2 text-sm leading-6 text-[#718078]">Dùng tài khoản nội bộ được quản trị viên cấp.</p>
        {account === "updated" && <div className="mt-5 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">Tài khoản đã được cập nhật. Hãy đăng nhập lại bằng thông tin mới.</div>}
        {error && <div className="mt-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error === "setup" ? "Hệ thống chưa có cấu hình người dùng." : "Tên đăng nhập hoặc mật khẩu không hợp lệ."}</div>}
        <form action={login} className="mt-7 space-y-5">
          <label className="block text-sm font-medium">Tên đăng nhập<input name="username" autoComplete="username" required maxLength={80} className="mt-2 h-11 w-full rounded-xl border border-[#d9e2dc] bg-white px-3 outline-none transition focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /></label>
          <label className="block text-sm font-medium">Mật khẩu<input name="password" type="password" autoComplete="current-password" required maxLength={200} className="mt-2 h-11 w-full rounded-xl border border-[#d9e2dc] bg-white px-3 outline-none transition focus:border-[#23815c] focus:ring-3 focus:ring-[#23815c]/10" /></label>
          <button className="h-11 w-full rounded-xl bg-[#176b4a] font-semibold text-white transition hover:bg-[#11583d]">Đăng nhập</button>
        </form>
      </section>
    </main>
  );
}

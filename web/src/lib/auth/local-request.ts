export function isLocalAdminRuntime(request: Request) {
  if (process.env.NODE_ENV === "production") return false;
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    const hostname = new URL(`http://${host}`).hostname;
    return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
  } catch {
    return false;
  }
}

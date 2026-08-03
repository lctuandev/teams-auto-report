type CookieSecurityOptions = {
  override?: string;
  forwardedProto?: string | null;
  origin?: string | null;
  nodeEnv?: string;
};

export function shouldUseSecureCookie({
  override,
  forwardedProto,
  origin,
  nodeEnv,
}: CookieSecurityOptions): boolean {
  const normalizedOverride = override?.trim().toLowerCase();
  if (normalizedOverride === "true") return true;
  if (normalizedOverride === "false") return false;

  const protocol = forwardedProto?.split(",", 1)[0]?.trim().toLowerCase();
  if (protocol === "https") return true;
  if (protocol === "http") return false;

  if (origin) {
    try {
      return new URL(origin).protocol === "https:";
    } catch {
      // Fall through to the safe production default.
    }
  }

  return nodeEnv === "production";
}

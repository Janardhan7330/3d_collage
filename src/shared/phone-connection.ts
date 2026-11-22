export type PhoneConnection = { available: boolean; reason: string };

export function phoneConnection(origin: string): PhoneConnection {
  try {
    const url = new URL(origin);
    const host = url.hostname.toLowerCase();
    if (
      host === "localhost" ||
      host.endsWith(".localhost") ||
      host.startsWith("127.") ||
      host === "[::1]" ||
      host === "0.0.0.0"
    )
      return {
        available: false,
        reason:
          "This address only opens on this computer. Open the studio through its phone-testing HTTPS link before connecting your phone.",
      };
    if (url.protocol !== "https:")
      return {
        available: false,
        reason:
          "Phone mapping needs an HTTPS address so your browser can ask for location and motion access.",
      };
    return { available: true, reason: "" };
  } catch {
    return {
      available: false,
      reason: "A valid HTTPS address is needed before connecting a phone.",
    };
  }
}

/** Only capture a service's app URL, never a documentation or account link in its banner. */
export function tunnelOrigin(log: string): string | null {
  return (
    log.match(
      /tunneled with tls termination,\s+(https:\/\/[a-z0-9-]+(?:\.app)?\.lhr\.life)\b/,
    )?.[1] ??
    log.match(/\|\s+(https:\/\/[a-z0-9-]+\.trycloudflare\.com)\s*\|/)?.[1] ??
    null
  );
}

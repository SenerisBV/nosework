import { UAParser } from "ua-parser-js";
import type { ParsedUserAgent } from "./types.js";

export function parseUserAgent(userAgent: string | null): ParsedUserAgent {
  const emptyResult: ParsedUserAgent = {
    browser: null,
    browserVer: null,
    os: null,
    osVer: null,
    device: null,
  };

  if (!userAgent) return emptyResult;

  try {
    const parser = new UAParser(userAgent);
    const result = parser.getResult();

    // Determine device type
    let device: "desktop" | "mobile" | "tablet" | null = null;
    const deviceType = result.device?.type?.toLowerCase();

    if (deviceType === "mobile") {
      device = "mobile";
    } else if (deviceType === "tablet") {
      device = "tablet";
    } else if (result.os?.name) {
      // If we have an OS but no mobile/tablet device type, assume desktop
      device = "desktop";
    }

    return {
      browser: result.browser?.name ?? null,
      browserVer: result.browser?.version?.split(".")[0] ?? null, // Major version only
      os: result.os?.name ?? null,
      osVer: result.os?.version?.split(".")[0] ?? null, // Major version only
      device,
    };
  } catch {
    return emptyResult;
  }
}

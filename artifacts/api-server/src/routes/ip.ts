import { Router, type IRouter } from "express";
import { LookupIpQueryParams, LookupIpResponse } from "@workspace/api-zod";
import { isValidIp, lookupIpAddress } from "../lib/ipLookup";

const router: IRouter = Router();

function extractCallerIp(req: import("express").Request): string {
  const forwarded = req.headers["x-forwarded-for"];
  const forwardedIp = Array.isArray(forwarded) ? forwarded[0] : forwarded?.split(",")[0]?.trim();
  const raw = forwardedIp || req.socket.remoteAddress || "";
  return raw.startsWith("::ffff:") ? raw.slice(7) : raw;
}

router.get("/ip-lookup", async (req, res): Promise<void> => {
  const parsed = LookupIpQueryParams.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const target = parsed.data.ip?.trim() || extractCallerIp(req);

  if (!target || !isValidIp(target)) {
    res.status(400).json({ error: `"${target || parsed.data.ip}" is not a valid IPv4 or IPv6 address` });
    return;
  }

  try {
    const info = await lookupIpAddress(target);
    res.json(LookupIpResponse.parse(info));
  } catch (err) {
    req.log.error({ err, ip: target }, "IP lookup failed");
    res.status(502).json({ error: "Failed to look up information for this IP address" });
  }
});

export default router;

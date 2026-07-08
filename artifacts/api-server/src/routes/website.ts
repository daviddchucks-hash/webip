import { Router, type IRouter } from "express";
import { InspectWebsiteQueryParams, InspectWebsiteResponse } from "@workspace/api-zod";
import { inspectWebsite, WebsiteFetchError, WebsiteInspectError } from "../lib/websiteInspect";

const router: IRouter = Router();

router.get("/website-inspect", async (req, res): Promise<void> => {
  const parsed = InspectWebsiteQueryParams.safeParse(req.query);
  if (!parsed.success || !parsed.data.url.trim()) {
    res.status(400).json({ error: "A website URL is required" });
    return;
  }

  try {
    const result = await inspectWebsite(parsed.data.url.trim());
    res.json(InspectWebsiteResponse.parse(result));
  } catch (err) {
    if (err instanceof WebsiteInspectError) {
      res.status(400).json({ error: err.message });
      return;
    }
    if (err instanceof WebsiteFetchError) {
      res.status(502).json({ error: err.message || "Failed to reach the requested website" });
      return;
    }
    req.log.error({ err, url: parsed.data.url }, "Website inspection failed");
    res.status(502).json({ error: "Failed to inspect the requested website" });
  }
});

export default router;

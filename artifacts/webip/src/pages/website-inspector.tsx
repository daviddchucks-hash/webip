import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useInspectWebsite, getInspectWebsiteQueryKey } from "@workspace/api-client-react";
import { Globe, Search, Download, AlertCircle, Loader2, Star, Shield, Cpu, Code, Link as LinkIcon, FileJson, CheckCircle2, XCircle } from "lucide-react";
import { useHistory } from "@/hooks/use-history";
import { cn } from "@/lib/utils";
import { DataItem } from "@/components/shared";

export default function WebsiteInspector() {
  const [location, setLocation] = useLocation();
  
  // Extract URL from query params to support /website?url=...
  // Doing it this way because URLs have slashes and get messy in path params.
  const queryUrl = new URLSearchParams(window.location.search).get("url");
  
  const [inputValue, setInputValue] = useState(queryUrl || "");
  const { addHistory, history, toggleFavorite } = useHistory();

  const { data, error, isLoading, isFetching } = useInspectWebsite(
    { url: queryUrl! },
    {
      query: {
        enabled: !!queryUrl,
        retry: false,
        queryKey: getInspectWebsiteQueryKey({ url: queryUrl! }),
      }
    }
  );

  useEffect(() => {
    if (data?.requestedUrl) {
      addHistory("website", data.requestedUrl, data.title || data.requestedUrl);
    }
  }, [data?.requestedUrl]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    
    let target = inputValue.trim();
    if (!target.startsWith("http://") && !target.startsWith("https://")) {
      target = `https://${target}`;
    }
    
    setLocation(`/website?url=${encodeURIComponent(target)}`);
  };

  const handleDownloadJson = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `inspect-${new URL(data.finalUrl).hostname}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleDownloadHtml = () => {
    if (!data?.htmlSource) return;
    const blob = new Blob([data.htmlSource], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `source-${new URL(data.finalUrl).hostname}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isFav = data?.requestedUrl ? history.find(h => h.type === "website" && h.query === data.requestedUrl)?.isFavorite : false;
  const historyId = data?.requestedUrl ? `website-${data.requestedUrl}` : null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Website Inspector</h1>
          <p className="text-muted-foreground mt-1">
            Deep scan any URL for SEO, security, performance, and structure.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative max-w-3xl">
        <div className="relative flex items-center w-full">
          <Globe className="absolute left-3 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="https://example.com"
            className="w-full h-12 pl-10 pr-24 rounded-lg border border-border bg-card/50 text-foreground shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-mono text-sm"
          />
          <button
            type="submit"
            disabled={isFetching || !inputValue.trim()}
            className="absolute right-1.5 h-9 px-4 rounded-md bg-cyan-600 text-white font-medium text-sm hover:bg-cyan-700 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Inspect"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5" />
          <div>
            <h3 className="font-semibold">Inspection Failed</h3>
            <p className="text-sm mt-1">{error?.data?.error || "Could not reach the website or parse its content."}</p>
          </div>
        </div>
      ) : isLoading ? (
        <WebsiteSkeleton />
      ) : data ? (
        <div className="space-y-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between bg-card border border-border rounded-lg p-5 shadow-sm gap-4">
            <div className="flex items-start gap-4">
              {data.favicon ? (
                <img src={data.favicon} alt="favicon" className="w-12 h-12 rounded bg-background p-1 border border-border shrink-0" onError={(e) => (e.currentTarget.style.display = 'none')} />
              ) : (
                <div className="w-12 h-12 rounded bg-muted flex items-center justify-center border border-border shrink-0">
                  <Globe className="h-6 w-6 text-muted-foreground" />
                </div>
              )}
              <div className="overflow-hidden">
                <h2 className="text-xl font-bold truncate" title={data.title || "No Title"}>{data.title || "No Title"}</h2>
                <div className="flex items-center gap-2 mt-1 flex-wrap">
                  <a href={data.finalUrl} target="_blank" rel="noopener noreferrer" className="text-sm text-cyan-500 hover:underline truncate max-w-sm font-mono">
                    {data.finalUrl}
                  </a>
                  <span className={cn("px-2 py-0.5 rounded text-xs font-medium border", data.httpStatus >= 400 ? "bg-destructive/10 text-destructive border-destructive/20" : data.httpStatus >= 300 ? "bg-yellow-500/10 text-yellow-600 border-yellow-500/20" : "bg-green-500/10 text-green-600 border-green-500/20")}>
                    HTTP {data.httpStatus}
                  </span>
                  {data.sslInfo?.valid && (
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-green-500/10 text-green-600 border border-green-500/20 flex items-center gap-1">
                      <Shield className="h-3 w-3" /> Secure
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              {historyId && (
                <button
                  onClick={() => toggleFavorite(historyId)}
                  className="h-10 w-10 flex items-center justify-center rounded-md border border-border bg-background hover:bg-muted transition-colors"
                  title="Favorite"
                >
                  <Star className={cn("h-4 w-4 transition-colors", isFav ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} />
                </button>
              )}
              <button
                onClick={handleDownloadJson}
                className="h-10 px-4 flex items-center gap-2 rounded-md border border-border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card shadow-sm flex flex-col">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center gap-2 font-medium">
                <Search className="h-4 w-4 text-cyan-500" />
                Meta & SEO Info
              </div>
              <div className="p-4 space-y-1">
                <DataItem label="Description" value={data.metaDescription} />
                <DataItem label="Canonical" value={data.canonicalUrl} mono />
                <DataItem label="Language" value={data.language} />
                <DataItem label="Charset" value={data.charset} />
                <DataItem label="Robots Tag" value={data.metaRobots} />
                
                {data.openGraph && data.openGraph.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-border/50">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Open Graph</h4>
                    {data.openGraph.map(og => <DataItem key={og.key} label={og.key.replace('og:', '')} value={og.value} />)}
                  </div>
                )}
                {data.twitterCard && data.twitterCard.length > 0 && (
                  <div className="pt-3 mt-3 border-t border-border/50">
                    <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Twitter Card</h4>
                    {data.twitterCard.map(tc => <DataItem key={tc.key} label={tc.key.replace('twitter:', '')} value={tc.value} />)}
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card shadow-sm flex flex-col">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center gap-2 font-medium">
                <Shield className="h-4 w-4 text-cyan-500" />
                Security & SSL
              </div>
              <div className="p-4 space-y-1">
                {data.sslInfo && (
                  <>
                    <DataItem label="Status" value={data.sslInfo.valid ? "Valid" : data.sslInfo.error || "Invalid"} />
                    <DataItem label="Issuer" value={data.sslInfo.issuer} />
                    <DataItem label="Protocol" value={data.sslInfo.protocol} mono />
                    <DataItem label="Valid From" value={data.sslInfo.validFrom} />
                    <DataItem label="Valid To" value={data.sslInfo.validTo} />
                    <DataItem label="Days Remaining" value={data.sslInfo.daysRemaining} />
                  </>
                )}
                <div className="pt-3 mt-3 border-t border-border/50">
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">HTTP Headers</h4>
                  <div className="max-h-48 overflow-y-auto custom-scrollbar pr-2">
                    {data.responseHeaders?.map(h => (
                      <DataItem key={h.key} label={h.key} value={h.value} mono />
                    ))}
                  </div>
                </div>
              </div>
            </div>
            
            <div className="rounded-lg border border-border bg-card shadow-sm flex flex-col md:col-span-2">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center gap-2 font-medium">
                <Cpu className="h-4 w-4 text-cyan-500" />
                Tech Stack & Assets
              </div>
              <div className="p-4 grid md:grid-cols-3 gap-6">
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Detected Tech</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.technologies?.length ? data.technologies.map(t => (
                      <span key={t} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded border border-border">{t}</span>
                    )) : <span className="text-sm text-muted-foreground">No technologies detected</span>}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Analytics</h4>
                  <div className="flex flex-wrap gap-2">
                    {data.analyticsDetected?.length ? data.analyticsDetected.map(t => (
                      <span key={t} className="px-2 py-1 bg-secondary text-secondary-foreground text-xs rounded border border-border">{t}</span>
                    )) : <span className="text-sm text-muted-foreground">No analytics detected</span>}
                  </div>
                </div>
                <div>
                  <h4 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">Counts</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Internal Links</span>
                      <span className="font-mono">{data.internalLinks?.length || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">External Links</span>
                      <span className="font-mono">{data.externalLinks?.length || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">CSS Files</span>
                      <span className="font-mono">{data.cssFiles?.length || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">JS Files</span>
                      <span className="font-mono">{data.jsFiles?.length || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Images</span>
                      <span className="font-mono">{data.images?.length || 0}</span>
                    </div>
                    <div className="flex justify-between border-b border-border/50 pb-1">
                      <span className="text-muted-foreground">Forms</span>
                      <span className="font-mono">{data.formsCount || 0}</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            <div className="rounded-lg border border-border bg-card shadow-sm flex flex-col md:col-span-2">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between font-medium">
                <div className="flex items-center gap-2">
                  <Code className="h-4 w-4 text-cyan-500" />
                  Audit Findings
                </div>
              </div>
              <div className="p-4 grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-sm font-semibold mb-3">SEO & Metadata</h4>
                  <div className="space-y-2">
                    {data.seoAudit?.length ? data.seoAudit.map((finding, i) => (
                      <AuditItem key={i} finding={finding} />
                    )) : <span className="text-sm text-muted-foreground">No SEO data</span>}
                  </div>
                </div>
                <div>
                  <h4 className="text-sm font-semibold mb-3">Accessibility</h4>
                  <div className="space-y-2">
                    {data.accessibilitySuggestions?.length ? data.accessibilitySuggestions.map((finding, i) => (
                      <AuditItem key={i} finding={finding} />
                    )) : <span className="text-sm text-muted-foreground">No accessibility data</span>}
                  </div>
                </div>
              </div>
            </div>

            {data.htmlSource && (
              <div className="rounded-lg border border-border bg-card shadow-sm flex flex-col md:col-span-2">
                <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between font-medium">
                  <div className="flex items-center gap-2">
                    <FileJson className="h-4 w-4 text-cyan-500" />
                    HTML Source
                  </div>
                  <button
                    onClick={handleDownloadHtml}
                    className="h-8 px-3 flex items-center gap-2 rounded text-xs font-medium border border-border bg-background hover:bg-muted transition-colors"
                  >
                    <Download className="h-3 w-3" /> Source
                  </button>
                </div>
                <div className="bg-[#09090b] text-[#d4d4d8] rounded-b-lg">
                  <pre className="p-4 text-xs font-mono overflow-auto max-h-96 custom-scrollbar whitespace-pre">
                    {data.htmlSource}
                  </pre>
                </div>
              </div>
            )}
            
          </div>
        </div>
      ) : null}
    </div>
  );
}

function AuditItem({ finding }: { finding: { severity: "good" | "warning" | "error"; message: string } }) {
  const isGood = finding.severity === "good";
  const isWarn = finding.severity === "warning";
  
  return (
    <div className="flex items-start gap-2 text-sm p-2 rounded bg-background border border-border/50">
      {isGood ? (
        <CheckCircle2 className="h-4 w-4 text-green-500 shrink-0 mt-0.5" />
      ) : isWarn ? (
        <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0 mt-0.5" />
      ) : (
        <XCircle className="h-4 w-4 text-destructive shrink-0 mt-0.5" />
      )}
      <span className={isGood ? "text-muted-foreground" : "text-foreground"}>{finding.message}</span>
    </div>
  );
}

function WebsiteSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="h-24 bg-card border border-border rounded-lg shadow-sm" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-80 bg-card border border-border rounded-lg shadow-sm" />
        <div className="h-80 bg-card border border-border rounded-lg shadow-sm" />
        <div className="h-64 bg-card border border-border rounded-lg shadow-sm md:col-span-2" />
      </div>
    </div>
  );
}

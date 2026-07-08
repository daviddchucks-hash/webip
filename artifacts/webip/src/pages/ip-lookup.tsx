import { useState, useEffect } from "react";
import { useParams, useLocation } from "wouter";
import { useLookupIp, getLookupIpQueryKey } from "@workspace/api-client-react";
import { Search, MapPin, Network, Server, FileText, AlertCircle, Loader2, Download, Star } from "lucide-react";
import { useHistory } from "@/hooks/use-history";
import { cn } from "@/lib/utils";
import { DataItem } from "@/components/shared";

export default function IpLookup() {
  const params = useParams();
  const [, setLocation] = useLocation();
  const [inputValue, setInputValue] = useState(params.ip || "");
  const { addHistory, history, toggleFavorite } = useHistory();

  // If there's an IP in URL, use it. If not, we'll fetch the user's IP.
  const queryParam = params.ip ? { ip: params.ip } : undefined;
  
  const { data, error, isLoading, isFetching } = useLookupIp(queryParam, {
    query: {
      retry: false,
      queryKey: getLookupIpQueryKey(queryParam),
    }
  });

  useEffect(() => {
    if (data?.ip) {
      addHistory("ip", data.ip, data.hostname || data.city || "Unknown Location");
    }
  }, [data?.ip]); // only run when data.ip changes

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputValue.trim()) {
      setLocation("/ip");
    } else {
      setLocation(`/ip/${encodeURIComponent(inputValue.trim())}`);
    }
  };

  const handleDownload = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ip-lookup-${data.ip}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const isFav = data?.ip ? history.find(h => h.type === "ip" && h.query === data.ip)?.isFavorite : false;
  const historyId = data?.ip ? `ip-${data.ip}` : null;

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">IP Lookup</h1>
          <p className="text-muted-foreground mt-1">
            Analyze any IPv4/IPv6 address or discover your own public IP context.
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="relative max-w-2xl">
        <div className="relative flex items-center w-full">
          <Search className="absolute left-3 h-5 w-5 text-muted-foreground" />
          <input
            type="text"
            value={inputValue}
            onChange={(e) => setInputValue(e.target.value)}
            placeholder="Enter IPv4 or IPv6 address (leave empty for your IP)"
            className="w-full h-12 pl-10 pr-24 rounded-lg border border-border bg-card/50 text-foreground shadow-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition-all font-mono text-sm"
          />
          <button
            type="submit"
            disabled={isFetching}
            className="absolute right-1.5 h-9 px-4 rounded-md bg-primary text-primary-foreground font-medium text-sm hover:bg-primary/90 transition-colors disabled:opacity-50 flex items-center gap-2"
          >
            {isFetching ? <Loader2 className="h-4 w-4 animate-spin" /> : "Analyze"}
          </button>
        </div>
      </form>

      {error ? (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-destructive flex items-start gap-3">
          <AlertCircle className="h-5 w-5 mt-0.5" />
          <div>
            <h3 className="font-semibold">Lookup Failed</h3>
            <p className="text-sm mt-1">{error?.data?.error || "Invalid IP address or service unavailable."}</p>
          </div>
        </div>
      ) : isLoading ? (
        <IpSkeleton />
      ) : data ? (
        <div className="space-y-6">
          <div className="flex items-center justify-between bg-card border border-border rounded-lg p-4 shadow-sm">
            <div className="flex items-center gap-4">
              <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary">
                <Server className="h-6 w-6" />
              </div>
              <div>
                <div className="flex items-center gap-3">
                  <h2 className="text-2xl font-bold font-mono tracking-tight">{data.ip}</h2>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 rounded text-xs font-medium bg-muted text-muted-foreground border border-border">
                      {data.ipVersion || "Unknown Version"}
                    </span>
                    {data.isProxy && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-destructive/10 text-destructive border border-destructive/20">
                        Proxy / VPN
                      </span>
                    )}
                    {data.hostingProvider && (
                      <span className="px-2 py-0.5 rounded text-xs font-medium bg-orange-500/10 text-orange-500 border border-orange-500/20">
                        Datacenter / Hosting
                      </span>
                    )}
                  </div>
                </div>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  {data.hostname ? <span className="font-mono text-xs">{data.hostname}</span> : "No reverse DNS"}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
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
                onClick={handleDownload}
                className="h-10 px-4 flex items-center gap-2 rounded-md border border-border bg-background hover:bg-muted text-sm font-medium transition-colors"
              >
                <Download className="h-4 w-4" />
                <span>JSON</span>
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden flex flex-col">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center gap-2 font-medium">
                <MapPin className="h-4 w-4 text-primary" />
                Location Data
              </div>
              <div className="p-4 space-y-1 flex-1">
                <DataItem label="Continent" value={data.continent} />
                <DataItem label="Country" value={data.country ? `${data.country} (${data.countryCode})` : null} />
                <DataItem label="Region" value={data.region} />
                <DataItem label="City" value={data.city} />
                <DataItem label="Postal Code" value={data.postalCode} />
                <DataItem label="Timezone" value={data.timezone} />
                <DataItem label="Coordinates" value={(data.latitude && data.longitude) ? `${data.latitude}, ${data.longitude}` : null} mono />
                <DataItem label="Currency" value={data.currencyName ? `${data.currencyName} (${data.currencyCode})` : null} />
                
                {data.googleMapsUrl && (
                  <div className="pt-4 mt-2">
                    <a
                      href={data.googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-2 text-sm text-primary hover:underline font-medium"
                    >
                      <MapPin className="h-4 w-4" />
                      View on Google Maps
                    </a>
                  </div>
                )}
              </div>
            </div>

            <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden flex flex-col">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center gap-2 font-medium">
                <Network className="h-4 w-4 text-primary" />
                Network Details
              </div>
              <div className="p-4 space-y-1 flex-1">
                <DataItem label="ISP" value={data.isp} />
                <DataItem label="Organization" value={data.organization} />
                <DataItem label="ASN" value={data.asn} mono />
                <DataItem label="Network Route" value={data.network} mono />
                <DataItem label="Connection Type" value={data.connectionType} />
                <DataItem label="Reverse DNS" value={data.reverseDns} mono />
                
                <div className="pt-4 mt-2 grid grid-cols-2 gap-4">
                  <div className="rounded border border-border bg-background p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Proxy/VPN</div>
                    <div className={cn("font-medium", data.isProxy ? "text-destructive" : "text-green-500")}>
                      {data.isProxy ? "Detected" : "Clean"}
                    </div>
                  </div>
                  <div className="rounded border border-border bg-background p-3 text-center">
                    <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Hosting</div>
                    <div className={cn("font-medium", data.hostingProvider ? "text-orange-500" : "text-green-500")}>
                      {data.hostingProvider ? "Yes" : "No"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {data.whois && (
            <div className="rounded-lg border border-border bg-card shadow-sm overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 border-b border-border flex items-center justify-between font-medium">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  Raw WHOIS Record
                </div>
              </div>
              <div className="p-0 bg-[#09090b] text-[#d4d4d8]">
                <pre className="p-4 text-xs font-mono overflow-x-auto whitespace-pre max-h-96 overflow-y-auto custom-scrollbar">
                  {data.whois}
                </pre>
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

function IpSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="h-24 bg-card border border-border rounded-lg shadow-sm" />
      <div className="grid md:grid-cols-2 gap-6">
        <div className="h-80 bg-card border border-border rounded-lg shadow-sm" />
        <div className="h-80 bg-card border border-border rounded-lg shadow-sm" />
      </div>
      <div className="h-48 bg-card border border-border rounded-lg shadow-sm" />
    </div>
  );
}

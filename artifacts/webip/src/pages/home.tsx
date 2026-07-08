import { Link } from "wouter";
import { Search, Activity, Globe, ArrowRight, ShieldCheck, Database, Zap } from "lucide-react";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[80vh] gap-12 text-center relative max-w-4xl mx-auto">
      {/* Background glow effects */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-primary/20 blur-[120px] rounded-full pointer-events-none -z-10" />
      
      <div className="space-y-6">
        <div className="inline-flex items-center rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-sm font-medium text-primary">
          <Zap className="mr-2 h-4 w-4" />
          Advanced Diagnostics Toolkit
        </div>
        <h1 className="text-5xl sm:text-7xl font-bold tracking-tight text-foreground">
          Precision insight for <br />
          <span className="text-transparent bg-clip-text bg-gradient-to-r from-primary to-cyan-400">
            networks & domains
          </span>
        </h1>
        <p className="text-lg sm:text-xl text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
          The professional's toolkit for deep-diving into IP addresses, routing, DNS records, 
          and complete website anatomy. Fast, raw, and formatted for humans.
        </p>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 w-full max-w-2xl">
        <Link href="/ip" className="group relative flex flex-col gap-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5">
          <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center text-primary group-hover:scale-110 transition-transform">
            <Activity className="h-6 w-6" />
          </div>
          <div className="text-left space-y-2">
            <h3 className="font-semibold text-lg flex items-center justify-between">
              Look up an IP
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-primary" />
            </h3>
            <p className="text-sm text-muted-foreground">
              Trace any IPv4 or IPv6 address. Discover geolocation, ASN, ISP, proxy detection, and raw WHOIS data.
            </p>
          </div>
        </Link>

        <Link href="/website" className="group relative flex flex-col gap-4 rounded-xl border border-border/50 bg-card/50 backdrop-blur-sm p-6 hover:border-primary/50 transition-all hover:shadow-lg hover:shadow-primary/5">
          <div className="h-12 w-12 rounded-lg bg-cyan-500/10 flex items-center justify-center text-cyan-500 group-hover:scale-110 transition-transform">
            <Globe className="h-6 w-6" />
          </div>
          <div className="text-left space-y-2">
            <h3 className="font-semibold text-lg flex items-center justify-between">
              Inspect a website
              <ArrowRight className="h-4 w-4 opacity-0 -translate-x-2 group-hover:opacity-100 group-hover:translate-x-0 transition-all text-cyan-500" />
            </h3>
            <p className="text-sm text-muted-foreground">
              Deconstruct any URL. Analyze HTTP headers, SSL chains, SEO metadata, DOM metrics, and raw source code.
            </p>
          </div>
        </Link>
      </div>

      <div className="grid grid-cols-3 gap-8 mt-12 pt-12 border-t border-border/30 text-muted-foreground text-sm max-w-2xl w-full">
        <div className="flex flex-col items-center gap-2">
          <ShieldCheck className="h-5 w-5" />
          <span>Security & SSL Info</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Database className="h-5 w-5" />
          <span>DNS & Routing</span>
        </div>
        <div className="flex flex-col items-center gap-2">
          <Search className="h-5 w-5" />
          <span>SEO & Content Audit</span>
        </div>
      </div>
    </div>
  );
}

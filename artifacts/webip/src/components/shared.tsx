import { Copy, Check } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";

export function CopyButton({ text, className }: { text: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy text: ", err);
    }
  };

  return (
    <button
      onClick={(e) => {
        e.preventDefault();
        handleCopy();
      }}
      className={cn(
        "inline-flex h-6 w-6 items-center justify-center rounded-md border border-border bg-background text-muted-foreground hover:bg-muted hover:text-foreground transition-all",
        className
      )}
      title="Copy to clipboard"
    >
      {copied ? <Check className="h-3 w-3 text-green-500" /> : <Copy className="h-3 w-3" />}
    </button>
  );
}

export function DataItem({ label, value, mono = false }: { label: string; value?: string | number | null; mono?: boolean }) {
  if (value === undefined || value === null || value === "") return null;
  return (
    <div className="flex flex-col sm:flex-row sm:items-center py-2 border-b border-border/50 last:border-0 gap-1 sm:gap-4 group">
      <span className="text-sm font-medium text-muted-foreground w-40 shrink-0">{label}</span>
      <div className="flex items-center gap-2 overflow-hidden flex-1">
        <span className={cn("text-sm truncate", mono && "font-mono")}>{value}</span>
        <CopyButton text={String(value)} className="opacity-0 group-hover:opacity-100 sm:opacity-100" />
      </div>
    </div>
  );
}

import { Link } from "wouter";
import { History as HistoryIcon, Search, Star, Trash2, Globe, Activity, ArrowRight, ShieldCheck } from "lucide-react";
import { useHistory, HistoryEntry } from "@/hooks/use-history";
import { formatDistanceToNow } from "date-fns";

export default function HistoryPage() {
  const { history, toggleFavorite, removeHistory, clearHistory } = useHistory();

  const ips = history.filter(h => h.type === "ip");
  const websites = history.filter(h => h.type === "website");
  const favorites = history.filter(h => h.isFavorite);

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500 max-w-5xl mx-auto">
      <div className="flex flex-col gap-4 md:flex-row md:items-end justify-between border-b border-border pb-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3">
            <HistoryIcon className="h-8 w-8 text-primary" />
            Lookup History
          </h1>
          <p className="text-muted-foreground mt-1">
            Your recent IP lookups and website inspections. Stored locally.
          </p>
        </div>
        {history.length > 0 && (
          <button
            onClick={clearHistory}
            className="h-10 px-4 rounded-md border border-destructive/30 text-destructive hover:bg-destructive/10 transition-colors text-sm font-medium flex items-center gap-2"
          >
            <Trash2 className="h-4 w-4" />
            Clear Non-Favorites
          </button>
        )}
      </div>

      {history.length === 0 ? (
        <div className="text-center py-24 border border-dashed border-border rounded-xl bg-card/20">
          <div className="h-16 w-16 rounded-full bg-muted flex items-center justify-center mx-auto text-muted-foreground mb-4">
            <Search className="h-8 w-8" />
          </div>
          <h3 className="text-xl font-semibold mb-2">No history yet</h3>
          <p className="text-muted-foreground max-w-md mx-auto mb-6">
            Your lookup history and favorites will appear here automatically.
          </p>
          <div className="flex justify-center gap-4">
            <Link href="/ip" className="text-primary hover:underline text-sm font-medium">Lookup an IP</Link>
            <span className="text-border">|</span>
            <Link href="/website" className="text-cyan-500 hover:underline text-sm font-medium">Inspect a Website</Link>
          </div>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-8 items-start">
          
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <Star className="h-5 w-5 text-yellow-500 fill-yellow-500" />
                Favorites
              </h2>
              <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground font-medium">{favorites.length}</span>
            </div>
            
            {favorites.length === 0 ? (
              <div className="p-8 text-center border border-dashed border-border rounded-xl text-muted-foreground text-sm">
                Star an item from your history to save it here.
              </div>
            ) : (
              <div className="space-y-3">
                {favorites.map(entry => (
                  <HistoryCard 
                    key={entry.id} 
                    entry={entry} 
                    onToggleFav={() => toggleFavorite(entry.id)} 
                    onRemove={() => removeHistory(entry.id)} 
                  />
                ))}
              </div>
            )}
          </div>

          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-xl font-semibold flex items-center gap-2">
                <HistoryIcon className="h-5 w-5 text-muted-foreground" />
                Recent
              </h2>
              <span className="text-xs bg-muted px-2 py-1 rounded-full text-muted-foreground font-medium">{history.length}</span>
            </div>
            
            <div className="space-y-3">
              {history.map(entry => (
                <HistoryCard 
                  key={entry.id} 
                  entry={entry} 
                  onToggleFav={() => toggleFavorite(entry.id)} 
                  onRemove={() => removeHistory(entry.id)} 
                />
              ))}
            </div>
          </div>
          
        </div>
      )}
    </div>
  );
}

function HistoryCard({ entry, onToggleFav, onRemove }: { entry: HistoryEntry, onToggleFav: () => void, onRemove: () => void }) {
  const isIp = entry.type === "ip";
  const Icon = isIp ? Activity : Globe;
  const href = isIp ? `/ip/${entry.query}` : `/website?url=${encodeURIComponent(entry.query)}`;
  
  return (
    <div className="group relative flex items-center justify-between p-4 rounded-xl border border-border bg-card shadow-sm hover:border-primary/40 transition-all">
      <Link href={href} className="flex items-center gap-4 flex-1 min-w-0 pr-4">
        <div className={`h-10 w-10 shrink-0 rounded-lg flex items-center justify-center ${isIp ? 'bg-primary/10 text-primary' : 'bg-cyan-500/10 text-cyan-500'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          <div className="flex items-center gap-2">
            <p className="font-semibold truncate text-foreground text-sm font-mono">{entry.query}</p>
          </div>
          <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
            <span className="truncate">{entry.title || "No metadata"}</span>
            <span>•</span>
            <span className="shrink-0">{formatDistanceToNow(entry.timestamp, { addSuffix: true })}</span>
          </div>
        </div>
      </Link>
      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0">
        <button
          onClick={(e) => { e.preventDefault(); onToggleFav(); }}
          className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:bg-muted transition-colors"
          title={entry.isFavorite ? "Unfavorite" : "Favorite"}
        >
          <Star className={`h-4 w-4 ${entry.isFavorite ? 'fill-yellow-500 text-yellow-500' : ''}`} />
        </button>
        <button
          onClick={(e) => { e.preventDefault(); onRemove(); }}
          className="h-8 w-8 flex items-center justify-center rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
          title="Remove"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

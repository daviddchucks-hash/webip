import { Link, useLocation } from "wouter";
import { Monitor, Globe, History, Activity } from "lucide-react";
import { ThemeToggle } from "./theme-toggle";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  const navItems = [
    { href: "/ip", label: "IP Lookup", icon: Activity },
    { href: "/website", label: "Web Inspector", icon: Globe },
    { href: "/history", label: "History", icon: History },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-background text-foreground selection:bg-primary/20">
      <header className="sticky top-0 z-50 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container mx-auto flex h-14 max-w-screen-2xl items-center px-4">
          <Link href="/" className="flex items-center gap-2 mr-6 text-primary hover:opacity-80 transition-opacity">
            <Monitor className="h-5 w-5" />
            <span className="font-semibold tracking-tight text-lg">WebIP</span>
          </Link>
          <nav className="flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => {
              const isActive = location.startsWith(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={`flex items-center gap-2 transition-colors hover:text-primary ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-4 w-4" />
                  <span className="hidden sm:inline-block">{item.label}</span>
                </Link>
              );
            })}
          </nav>
          <div className="flex flex-1 items-center justify-end space-x-2">
            <ThemeToggle />
          </div>
        </div>
      </header>
      <main className="flex-1 container mx-auto px-4 py-8 max-w-screen-xl">
        {children}
      </main>
      <footer className="border-t border-border/40 py-6">
        <div className="container mx-auto px-4 flex justify-between items-center text-sm text-muted-foreground">
          <p>WebIP Diagnostics Toolkit. Built for professionals.</p>
        </div>
      </footer>
    </div>
  );
}

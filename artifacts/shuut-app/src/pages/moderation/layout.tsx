import { type ReactNode } from "react";
import { Link, useLocation } from "wouter";
import shuutLogoLight from "@/assets/shuut-uu-icon-light.png";
import shuutLogoDark from "@/assets/shuut-uu-icon-dark.png";
import { useTheme } from "@/components/theme-provider";
import { useAuth } from "@/hooks/use-auth";

export function ModerationLayout({ children }: { children: ReactNode }) {
  const { theme } = useTheme();
  const { user } = useAuth();
  const [location] = useLocation();

  return (
    <div className="min-h-[100dvh] flex flex-col bg-background text-foreground">
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-border/50 bg-background/80 px-4 backdrop-blur-md">
        <div className="flex items-center gap-4">
          <Link href="/feed" className="flex items-center gap-2 transition-transform hover:scale-105 active:scale-95">
            <img 
              src={theme === 'dark' ? shuutLogoDark : shuutLogoLight} 
              alt="SHÜÜT" 
              className="w-8 h-8 object-contain"
            />
          </Link>
          <div className="h-4 w-px bg-border"></div>
          <span className="font-mono text-sm font-semibold tracking-wider text-muted-foreground">OPS_WORKSPACE</span>
        </div>
        
        <nav className="flex items-center gap-6">
          <Link 
            href="/moderation" 
            className={`text-sm font-medium transition-colors ${location === "/moderation" ? "text-primary" : "text-muted-foreground hover:text-foreground"}`}
          >
            Queue
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-full bg-secondary text-xs font-bold">
            {user?.email?.charAt(0).toUpperCase() || "O"}
          </div>
        </div>
      </header>
      
      <main className="flex-1 w-full p-4 lg:p-8">
        <div className="mx-auto max-w-7xl">
          {children}
        </div>
      </main>
    </div>
  );
}

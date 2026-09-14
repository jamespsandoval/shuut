import { type ReactNode } from "react"
import { Link, useLocation } from "wouter"
import { Mic, Home, User, Settings, Activity } from "lucide-react"
import shuutLogoDark from "@/assets/shuut-uu-icon-dark.png"
import shuutLogoLight from "@/assets/shuut-uu-icon-light.png"
import { useTheme } from "./theme-provider"

export function Layout({ children }: { children: ReactNode }) {
  const [location] = useLocation()
  const { theme } = useTheme()

  const navItems = [
    { icon: Home, label: "Feed", href: "/" },
    { icon: User, label: "Profile", href: "/u/me" }, // Stub for current user
  ]

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background w-full max-w-7xl mx-auto border-x border-border/40 shadow-sm relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] sticky top-0 h-[100dvh] border-r border-border/40 p-6 shrink-0 z-10">
        <div className="mb-10">
          <Link href="/" className="block w-fit rounded-full hover-elevate transition-transform hover:scale-105 active:scale-95">
            <img 
              src={theme === 'dark' ? shuutLogoDark : shuutLogoLight} 
              alt="SHÜÜT" 
              className="w-12 h-12 object-contain"
            />
          </Link>
          <p className="mt-3 max-w-[180px] text-sm font-semibold leading-snug text-muted-foreground">
            Shape the noise to signal.
          </p>
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={`flex items-center gap-4 px-4 py-3 rounded-xl text-lg font-semibold transition-all hover-elevate ${isActive ? 'bg-secondary text-foreground' : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'}`}
              >
                <item.icon className="w-6 h-6" strokeWidth={isActive ? 2.5 : 2} />
                <span>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        <Link href="/" className="mt-auto w-full">
          <div className="w-full bg-primary text-primary-foreground py-4 rounded-full text-center font-bold text-lg hover:brightness-110 active:scale-95 transition-all shadow-md shadow-primary/20">
            SHÜÜT it
          </div>
        </Link>
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[600px] min-h-[100dvh] pb-24 md:pb-0 mx-auto relative border-x border-border/20 bg-card/30">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-t border-border flex items-center justify-around z-50 pb-safe">
        {navItems.map((item) => {
          const isActive = location === item.href
          return (
            <Link key={item.href} href={item.href} className="p-3 rounded-full hover:bg-secondary/50 transition-colors">
              <item.icon 
                className={`w-6 h-6 ${isActive ? 'text-primary' : 'text-muted-foreground'}`} 
                strokeWidth={isActive ? 2.5 : 2} 
              />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

import { type ReactNode, useState } from "react"
import { Link, useLocation } from "wouter"
import { Home, User, MoreHorizontal } from "lucide-react"
import shuutLogoDark from "@/assets/shuut-uu-icon-dark.png"
import shuutLogoLight from "@/assets/shuut-uu-icon-light.png"
import { useTheme } from "./theme-provider"
import { getGetProfileQueryKey, useGetProfile } from "@workspace/api-client-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Button } from "./ui/button"
import { useAuth } from "@/hooks/use-auth"
import { useLogout } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"

export function Layout({ children }: { children: ReactNode }) {
  const [location, setLocation] = useLocation()
  const { theme } = useTheme()
  const { isSignedIn } = useAuth()
  const logoutMutation = useLogout()
  const queryClient = useQueryClient()
  const { data: profile } = useGetProfile('me', {
    query: {
      enabled: Boolean(isSignedIn),
      queryKey: getGetProfileQueryKey('me'),
    },
  })
  const [logoutDialogOpen, setLogoutDialogOpen] = useState(false)

  const navItems = [
    { icon: Home, label: "Feed", href: "/feed" },
    { icon: User, label: "Profile", href: "/u/me" },
  ]

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSettled: () => {
        queryClient.clear()
        setLogoutDialogOpen(false)
        setLocation("/")
      }
    })
  }

  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row bg-background w-full max-w-7xl mx-auto border-x border-border/40 shadow-sm relative">
      {/* Desktop Sidebar */}
      <aside className="hidden md:flex flex-col w-[280px] sticky top-0 h-[100dvh] border-r border-border/40 p-6 shrink-0 z-10">
        <div className="mb-4">
          <Link href="/feed" className="block w-fit rounded-full hover-elevate transition-transform hover:scale-105 active:scale-95">
            <img 
              src={theme === 'dark' ? shuutLogoDark : shuutLogoLight} 
              alt="SHÜÜT" 
              className="w-12 h-12 object-contain"
            />
          </Link>
        </div>

        <nav className="flex flex-col gap-4 flex-1">
          {navItems.map((item) => {
            const isActive = location === item.href || (item.href !== "/feed" && location.startsWith(item.href))
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

        {profile && (
          <div className="mt-auto pt-4 flex items-center justify-between gap-3 w-full border-t border-border/20">
            <Link href="/u/me" className="flex items-center gap-3 flex-1 min-w-0 hover:bg-secondary/50 p-2 rounded-xl transition-colors cursor-pointer">
              <div 
                className="w-10 h-10 rounded-full border border-border/50 flex items-center justify-center text-white font-bold text-sm shrink-0 overflow-hidden"
                style={{ backgroundColor: profile.founder.avatarColor || '#3B82F6' }}
              >
                {profile.founder.avatarUrl ? (
                  <img src={profile.founder.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  profile.founder.name.charAt(0).toUpperCase()
                )}
              </div>
              <div className="flex flex-col min-w-0 flex-1">
                <span className="font-bold text-sm truncate">{profile.founder.name}</span>
                <span className="text-muted-foreground text-xs truncate">@{profile.founder.handle}</span>
              </div>
            </Link>

            <Dialog.Root open={logoutDialogOpen} onOpenChange={setLogoutDialogOpen}>
              <Dialog.Trigger asChild>
                <Button variant="ghost" size="icon" className="shrink-0 rounded-full hover:bg-secondary">
                  <MoreHorizontal className="w-5 h-5 text-muted-foreground" />
                  <span className="sr-only">More options</span>
                </Button>
              </Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in" />
                <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-md translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-card border border-border shadow-xl p-6 animate-in fade-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]">
                  <Dialog.Title className="text-xl font-bold text-foreground mb-4">
                    Log out of SHÜÜT?
                  </Dialog.Title>
                  <Dialog.Description className="text-sm text-muted-foreground mb-6">
                    You can always log back in as @{profile.founder.handle} later.
                  </Dialog.Description>
                  <div className="flex flex-col gap-3">
                    <Button 
                      variant="destructive" 
                      className="w-full rounded-full font-bold h-12 text-lg"
                      onClick={handleLogout}
                    >
                      Log out
                    </Button>
                    <Dialog.Close asChild>
                      <Button variant="outline" className="w-full rounded-full font-bold h-12 text-lg">
                        Cancel
                      </Button>
                    </Dialog.Close>
                  </div>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
          </div>
        )}
      </aside>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-[600px] min-h-[100dvh] pb-24 md:pb-0 mx-auto md:mx-0 relative border-x border-border/20 bg-card/30">
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 h-16 bg-background/80 backdrop-blur-lg border-t border-border flex items-center justify-around z-50 pb-safe">
        {navItems.map((item) => {
          const isActive = location === item.href || (item.href !== "/feed" && location.startsWith(item.href))
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
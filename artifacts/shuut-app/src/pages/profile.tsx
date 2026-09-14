import { useState } from "react"
import { useParams, Link } from "wouter"
import { useGetProfile, useToggleFollow, useAskFounder } from "@workspace/api-client-react"
import { getGetProfileQueryKey } from "@workspace/api-client-react"
import { useQueryClient } from "@tanstack/react-query"
import { Layout } from "@/components/layout"
import { PostCard } from "@/components/post-card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Loader2, ArrowLeft, MessageSquareQuote } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import * as Dialog from "@radix-ui/react-dialog"

export default function Profile() {
  const { handle } = useParams()
  const { data: profile, isLoading, error } = useGetProfile(handle || "")
  const queryClient = useQueryClient()
  const toggleFollow = useToggleFollow()
  const askFounder = useAskFounder()
  const { toast } = useToast()

  const [askQuestion, setAskQuestion] = useState("")
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [askAnswer, setAskAnswer] = useState<{ answer: string; hasContext: boolean } | null>(null)

  const handleFollowToggle = () => {
    if (!profile) return
    toggleFollow.mutate(
      { handle: profile.founder.handle },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetProfileQueryKey(handle || ""), (old: any) => {
            if (!old) return old
            return {
              ...old,
              followerCount: data.followerCount,
              founder: {
                ...old.founder,
                isFollowing: data.isFollowing
              }
            }
          })
        }
      }
    )
  }

  const handleAskSubmit = () => {
    if (!handle || !askQuestion.trim()) return
    setAskAnswer(null)
    askFounder.mutate(
      { handle, data: { question: askQuestion } },
      {
        onSuccess: (res) => {
          setAskAnswer({ answer: res.answer, hasContext: res.hasEnoughContext })
        },
        onError: () => {
          toast({
            title: "Error",
            description: "Failed to ask the founder.",
            variant: "destructive"
          })
        }
      }
    )
  }

  const resetAsk = (open: boolean) => {
    setAskDialogOpen(open)
    if (!open) {
      setTimeout(() => {
        setAskQuestion("")
        setAskAnswer(null)
      }, 200)
    }
  }

  return (
    <Layout>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-4 py-3 flex items-center gap-6">
        <Link href="/" className="p-2 rounded-full hover:bg-secondary transition-colors text-foreground group">
          <ArrowLeft className="w-5 h-5 group-hover:-translate-x-1 transition-transform" />
        </Link>
        <div>
          <h1 className="text-xl font-bold text-foreground leading-tight">
            {profile?.founder.name || "Profile"}
          </h1>
          {profile && <p className="text-xs text-muted-foreground">{profile.postCount} SHÜÜTs</p>}
        </div>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      )}

      {error && (
        <div className="p-12 text-center text-destructive">
          Failed to load profile.
        </div>
      )}

      {profile && (
        <div className="min-h-screen pb-20">
          {/* Header */}
          <div className="px-6 py-8 border-b border-border/30 bg-card">
            <div className="flex justify-between items-start mb-6">
              <div 
                className="w-24 h-24 rounded-full border-4 border-background flex items-center justify-center text-white font-bold text-4xl shadow-md"
                style={{ backgroundColor: profile.founder.avatarColor || '#3B82F6' }}
              >
                {profile.founder.name.charAt(0).toUpperCase()}
              </div>
              
              <div className="flex gap-3">
                <Dialog.Root open={askDialogOpen} onOpenChange={resetAsk}>
                  <Dialog.Trigger asChild>
                    <Button variant="outline" className="rounded-full gap-2">
                      <MessageSquareQuote className="w-4 h-4" />
                      Ask Me
                    </Button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Overlay className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 animate-in fade-in" />
                    <Dialog.Content className="fixed left-[50%] top-[50%] z-50 w-full max-w-lg translate-x-[-50%] translate-y-[-50%] rounded-2xl bg-card border border-border shadow-xl p-6 animate-in fade-in zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%]">
                      <Dialog.Title className="text-xl font-bold text-foreground mb-4">
                        Ask {profile.founder.name}
                      </Dialog.Title>
                      <Dialog.Description className="text-sm text-muted-foreground mb-6">
                        Ask an AI agent trained exclusively on their past voice notes and transcripts.
                      </Dialog.Description>

                      {!askAnswer ? (
                        <div className="space-y-4">
                          <Textarea 
                            value={askQuestion}
                            onChange={e => setAskQuestion(e.target.value)}
                            placeholder="What's your framework for hiring?"
                            className="min-h-[120px]"
                          />
                          
                          {profile.suggestedQuestions.length > 0 && (
                            <div className="flex flex-wrap gap-2 mt-4">
                              {profile.suggestedQuestions.map((q, i) => (
                                <button
                                  key={i}
                                  onClick={() => setAskQuestion(q)}
                                  className="text-xs bg-secondary hover:bg-primary/20 hover:text-primary text-muted-foreground px-3 py-1.5 rounded-full transition-colors text-left"
                                >
                                  {q}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="flex justify-end gap-3 mt-6">
                            <Dialog.Close asChild>
                              <Button variant="ghost">Cancel</Button>
                            </Dialog.Close>
                            <Button 
                              onClick={handleAskSubmit} 
                              disabled={askFounder.isPending || !askQuestion.trim()}
                              className="rounded-full gap-2 px-6"
                            >
                              {askFounder.isPending && <Loader2 className="w-4 h-4 animate-spin" />}
                              Ask Agent
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-6 animate-in slide-in-from-bottom-4">
                          <div className="bg-secondary/30 p-4 rounded-xl border border-border/50">
                            <p className="text-foreground font-medium mb-4">{askQuestion}</p>
                            
                            <div className="prose prose-sm dark:prose-invert">
                              <p className="whitespace-pre-wrap">{askAnswer.answer}</p>
                            </div>

                            {!askAnswer.hasContext && (
                              <div className="mt-4 p-3 bg-destructive/10 text-destructive text-xs rounded-lg border border-destructive/20">
                                ⚠️ I don't have enough context from their past posts to answer this confidently.
                              </div>
                            )}
                          </div>
                          
                          <div className="flex justify-end">
                            <Button variant="outline" onClick={() => setAskAnswer(null)}>
                              Ask Another
                            </Button>
                          </div>
                        </div>
                      )}
                    </Dialog.Content>
                  </Dialog.Portal>
                </Dialog.Root>

                <Button 
                  onClick={handleFollowToggle}
                  disabled={toggleFollow.isPending}
                  variant={profile.founder.isFollowing ? "outline" : "default"}
                  className="rounded-full px-6 min-w-[100px]"
                >
                  {profile.founder.isFollowing ? "Following" : "Follow"}
                </Button>
              </div>
            </div>

            <div className="mb-4">
              <h2 className="text-2xl font-bold text-foreground">{profile.founder.name}</h2>
              <p className="text-muted-foreground">@{profile.founder.handle}</p>
            </div>

            <p className="text-foreground leading-relaxed mb-6 whitespace-pre-wrap">
              {profile.founder.bio}
            </p>

            <div className="flex gap-6 text-sm">
              <div className="flex gap-1.5 items-center">
                <span className="font-bold text-foreground tabular-nums">{profile.followingCount}</span>
                <span className="text-muted-foreground">Following</span>
              </div>
              <div className="flex gap-1.5 items-center">
                <span className="font-bold text-foreground tabular-nums">{profile.followerCount}</span>
                <span className="text-muted-foreground">Followers</span>
              </div>
            </div>
          </div>

          {/* Posts */}
          <div className="mt-2">
            <h3 className="px-6 py-4 font-bold text-lg border-b border-border/30">
              SHÜÜTs
            </h3>
            {profile.posts.length === 0 ? (
              <div className="p-12 text-center text-muted-foreground">
                No posts yet.
              </div>
            ) : (
              profile.posts.map(post => (
                <PostCard key={post.id} post={post} />
              ))
            )}
          </div>
        </div>
      )}
    </Layout>
  )
}

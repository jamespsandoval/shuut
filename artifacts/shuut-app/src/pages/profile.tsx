import { useEffect, useState } from "react"
import { useParams, Link, useLocation, useSearch } from "wouter"
import { useGetProfile, useToggleFollow, useAskFounder, useUpdateProfile, getGetProfileQueryKey, getGetFeedQueryKey, getGetFollowSuggestionsQueryKey } from "@workspace/api-client-react"
import { refreshFeedPages } from "@/lib/feed-refresh"
import { useQueryClient } from "@tanstack/react-query"
import { Layout } from "@/components/layout"
import { FeedItemCard } from "@/components/feed-item-card"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { Input } from "@/components/ui/input"
import { Loader2, ArrowLeft, MessageSquareQuote, Camera, X, MapPin, Link as LinkIcon } from "lucide-react"
import { useToast } from "@/hooks/use-toast"
import * as Dialog from "@radix-ui/react-dialog"
import * as Progress from "@radix-ui/react-progress"
import { z } from "zod"
import { useForm } from "react-hook-form"
import { zodResolver } from "@hookform/resolvers/zod"
import { ModerationActions } from "@/components/moderation-actions"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"

const profileSchema = z.object({
  name: z.string().min(1, "Name is required").max(80, "Name must be less than 80 characters"),
  handle: z.string().min(2, "Handle must be at least 2 characters").max(30, "Handle must be less than 30 characters").regex(/^[A-Za-z0-9_]+$/, "Handle can only contain letters, numbers, and underscores"),
  bio: z.string().max(240, "Bio must be less than 240 characters"),
  location: z.string().max(80, "Location must be less than 80 characters").optional().default(""),
  website: z.string().max(200, "Website must be less than 200 characters").optional().default(""),
})

function csrfToken(): string | null {
  const entry = document.cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith("shu_csrf="))
  return entry ? decodeURIComponent(entry.slice("shu_csrf=".length)) : null
}

function EditProfileDialog({ 
  profile, 
  open, 
  onOpenChange 
}: { 
  profile: any; 
  open: boolean; 
  onOpenChange: (open: boolean) => void 
}) {
  const { toast } = useToast()
  const queryClient = useQueryClient()
  const [, setLocation] = useLocation()
  const updateProfile = useUpdateProfile()
  
  const form = useForm<z.infer<typeof profileSchema>>({
    resolver: zodResolver(profileSchema),
    defaultValues: {
      name: profile.founder.name,
      handle: profile.founder.handle,
      bio: profile.founder.bio || "",
      location: profile.founder.location || "",
      website: profile.founder.website || "",
    }
  })

  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState(profile.founder.avatarUrl || "")
  const [uploadProgress, setUploadProgress] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState("")

  useEffect(() => {
    return () => {
      if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
    }
  }, [previewUrl])

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size > 3000000) {
      toast({ title: "Invalid image", description: "Choose a JPEG, PNG, or WebP image under 3MB.", variant: "destructive" })
      e.target.value = ""
      return
    }
    if (previewUrl.startsWith("blob:")) URL.revokeObjectURL(previewUrl)
    setSelectedFile(file)
    setPreviewUrl(URL.createObjectURL(file))
    setUploadError("")
    form.setValue("name", form.getValues("name"), { shouldDirty: true })
  }

  const uploadHeadshot = async (file: File): Promise<string> => {
    const csrf = csrfToken()
    const response = await fetch("/api/storage/uploads/request-url", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(csrf ? { "X-CSRF-Token": csrf } : {}),
      },
      body: JSON.stringify({ name: file.name, size: file.size, contentType: file.type }),
    })
    const payload = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(payload.error || "Could not start the upload")

    await new Promise<void>((resolve, reject) => {
      const request = new XMLHttpRequest()
      request.open("PUT", payload.uploadURL)
      request.setRequestHeader("Content-Type", file.type)
      request.upload.onprogress = (event) => {
        if (event.lengthComputable) setUploadProgress(Math.round((event.loaded / event.total) * 100))
      }
      request.onload = () => request.status >= 200 && request.status < 300
        ? resolve()
        : reject(new Error("The image upload failed"))
      request.onerror = () => reject(new Error("The image upload was interrupted"))
      request.send(file)
    })
    return payload.objectPath
  }

  const onSubmit = async (data: z.infer<typeof profileSchema>) => {
    setUploadError("")
    let avatarObjectPath: string | undefined
    if (selectedFile) {
      setUploadProgress(0)
      try {
        avatarObjectPath = await uploadHeadshot(selectedFile)
      } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to upload headshot"
        setUploadError(message)
        setUploadProgress(null)
        toast({ title: "Upload failed", description: message, variant: "destructive" })
        return
      }
    }
    updateProfile.mutate(
      { handle: "me", data: { ...data, avatarObjectPath } },
      {
        onSuccess: (updatedProfile) => {
          setUploadProgress(null)
          setSelectedFile(null)
          toast({ title: "Profile updated successfully" })
          onOpenChange(false)
          queryClient.setQueryData(getGetProfileQueryKey("me"), updatedProfile)
          queryClient.invalidateQueries({ queryKey: ["/api/feed"] })
          
          if (updatedProfile.founder.handle !== profile.founder.handle) {
            setLocation("/u/me")
          }
        },
        onError: () => {
          setUploadProgress(null)
          toast({ title: "Error", description: "Failed to update profile", variant: "destructive" })
        }
      }
    )
  }

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 z-[60] animate-in fade-in" />
        <Dialog.Content className="fixed left-[50%] top-[50%] z-[60] flex h-[100dvh] max-h-[100dvh] w-full max-w-xl translate-x-[-50%] translate-y-[-50%] flex-col overflow-hidden bg-card shadow-xl animate-in fade-in zoom-in-95 slide-in-from-bottom-10 sm:h-auto sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl sm:slide-in-from-bottom-0">
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="flex min-h-0 flex-1 flex-col">
              {/* Header */}
              <div className="flex items-center justify-between px-4 py-3 border-b border-border/50 shrink-0">
                <div className="flex items-center gap-6">
                  <Dialog.Close asChild>
                    <Button variant="ghost" size="icon" className="rounded-full shrink-0 hover:bg-secondary">
                      <X className="w-5 h-5" />
                    </Button>
                  </Dialog.Close>
                  <Dialog.Title className="text-xl font-bold text-foreground">Edit profile</Dialog.Title>
                </div>
                <Button 
                  type="submit" 
                  disabled={(!form.formState.isDirty && !selectedFile) || updateProfile.isPending || uploadProgress !== null}
                  className="rounded-full px-5 font-bold"
                >
                  {(updateProfile.isPending || uploadProgress !== null) && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                  Save
                </Button>
              </div>
              
              {/* Content */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                <div className="p-4 pb-1">
                  <div className="relative group w-[112px] h-[112px]">
                    <div 
                      className="w-[112px] h-[112px] rounded-full border-4 border-card flex items-center justify-center text-white font-bold text-4xl overflow-hidden bg-secondary relative shadow-sm"
                      style={{ backgroundColor: profile.founder.avatarColor || '#3B82F6' }}
                    >
                      {previewUrl ? (
                        <img src={previewUrl} alt="Profile headshot preview" className="w-full h-full object-cover" />
                      ) : (
                        profile.founder.name.charAt(0).toUpperCase()
                      )}
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-70 group-hover:opacity-100 transition-opacity cursor-pointer">
                        <Camera className="w-7 h-7 text-white" />
                      </div>
                    </div>
                    <input 
                      type="file" 
                      accept="image/png,image/jpeg,image/webp" 
                      aria-label="Upload profile headshot"
                      className="absolute inset-0 opacity-0 cursor-pointer w-full h-full rounded-full"
                      onChange={handleImageChange}
                      disabled={uploadProgress !== null}
                    />
                  </div>
                  {uploadProgress !== null && (
                    <div className="mt-3 w-[180px]" aria-live="polite">
                      <div className="mb-1 text-xs text-muted-foreground">Uploading headshot… {uploadProgress}%</div>
                      <Progress.Root value={uploadProgress} className="h-2 overflow-hidden rounded-full bg-secondary">
                        <Progress.Indicator className="h-full bg-primary transition-transform" style={{ transform: `translateX(-${100 - uploadProgress}%)` }} />
                      </Progress.Root>
                    </div>
                  )}
                  {uploadError && <p className="mt-2 text-sm text-destructive">{uploadError}</p>}
                </div>
                 
                 <div className="space-y-6 p-4 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Name" {...field} className="h-14 bg-transparent focus-visible:ring-1 text-lg rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="handle"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">Handle</FormLabel>
                        <FormControl>
                          <div className="relative">
                            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground text-lg">@</span>
                            <Input placeholder="handle" {...field} className="h-14 pl-9 bg-transparent focus-visible:ring-1 text-lg rounded-xl" />
                          </div>
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="bio"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">Bio</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="Bio" 
                            {...field} 
                            className="min-h-[120px] resize-none bg-transparent focus-visible:ring-1 text-lg rounded-xl py-3"
                            onChange={(e) => {
                              if (e.target.value.length <= 240) {
                                field.onChange(e)
                              }
                            }}
                          />
                        </FormControl>
                        <div className="flex justify-end mt-1">
                          <span className="text-xs text-muted-foreground">{field.value?.length || 0} / 240</span>
                        </div>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="location"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">Location</FormLabel>
                        <FormControl>
                          <Input placeholder="Location" {...field} className="h-14 bg-transparent focus-visible:ring-1 text-lg rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  
                  <FormField
                    control={form.control}
                    name="website"
                    render={({ field }) => (
                      <FormItem className="space-y-1">
                        <FormLabel className="text-muted-foreground text-xs font-medium uppercase tracking-wider ml-1">Website</FormLabel>
                        <FormControl>
                          <Input placeholder="Website" {...field} className="h-14 bg-transparent focus-visible:ring-1 text-lg rounded-xl" />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  )
}

export default function Profile() {
  const { handle } = useParams()
  const resolvedHandle = handle || ""
  const isCurrentUser = resolvedHandle === "me"

  const search = useSearch()
  const searchParams = new URLSearchParams(search)
  const shuutId = searchParams.get("shuut")
  const focusedPostId = shuutId ? parseInt(shuutId, 10) : null

  const { data: profile, isLoading, error } = useGetProfile(resolvedHandle)
  const queryClient = useQueryClient()
  const toggleFollow = useToggleFollow()
  const askFounder = useAskFounder()
  const { toast } = useToast()
  const [, setLocation] = useLocation()

  const [askQuestion, setAskQuestion] = useState("")
  const [askDialogOpen, setAskDialogOpen] = useState(false)
  const [askAnswer, setAskAnswer] = useState<{ answer: string; hasContext: boolean } | null>(null)
  
  const [editDialogOpen, setEditDialogOpen] = useState(false)

  const handleFollowToggle = () => {
    if (!profile) return
    toggleFollow.mutate(
      { handle: profile.founder.handle },
      {
        onSuccess: (data) => {
          queryClient.setQueryData(getGetProfileQueryKey(resolvedHandle), (old: any) => {
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
          void queryClient.invalidateQueries({ queryKey: getGetFeedQueryKey() })
          void queryClient.invalidateQueries({ queryKey: getGetFollowSuggestionsQueryKey() })
          void refreshFeedPages(queryClient)
        }
      }
    )
  }

  const handleAskSubmit = () => {
    if (!resolvedHandle || !askQuestion.trim()) return
    setAskAnswer(null)
    askFounder.mutate(
      { handle: resolvedHandle, data: { question: askQuestion } },
      {
        onSuccess: (res) => {
          setAskAnswer({ answer: res.answer, hasContext: res.hasEnoughContext })
        },
        onError: () => {
          toast({
            title: "Error",
            description: "We could not send your question.",
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

  useEffect(() => {
    if (focusedPostId && profile?.posts.find(item => item.type === "post" && item.post?.id === focusedPostId)) {
      const timeout = setTimeout(() => {
        const el = document.getElementById(`post-${focusedPostId}`)
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "center" })
        }
      }, 100)
      return () => clearTimeout(timeout)
    }
    return undefined;
  }, [focusedPostId, profile?.posts])

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
          {profile && (
            <p className="text-xs text-muted-foreground">
              {profile.postCount} {profile.postCount === 1 ? 'SHÜÜT' : 'SHÜÜTs'}
            </p>
          )}
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
                className="w-[112px] h-[112px] rounded-full border-4 border-card flex items-center justify-center text-white font-bold text-4xl shadow-sm overflow-hidden"
                style={{ backgroundColor: profile.founder.avatarColor || '#3B82F6' }}
              >
                {profile.founder.avatarUrl ? (
                  <img src={profile.founder.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  profile.founder.name.charAt(0).toUpperCase()
                )}
              </div>
              
              <div className="flex gap-3">
                {isCurrentUser ? (
                  <Button 
                    variant="outline" 
                    className="rounded-full px-6 font-bold"
                    onClick={() => setEditDialogOpen(true)}
                  >
                    Edit profile
                  </Button>
                ) : (
                  <>
                    {profile.postCount >= 5 && <Dialog.Root open={askDialogOpen} onOpenChange={resetAsk}>
                      <Dialog.Trigger asChild>
                        <Button variant="outline" className="rounded-full gap-2 font-bold">
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
                    </Dialog.Root>}

                    <Button 
                      onClick={handleFollowToggle}
                      disabled={toggleFollow.isPending}
                      variant={profile.founder.isFollowing ? "outline" : "default"}
                      className="rounded-full px-6 min-w-[100px] font-bold"
                    >
                      {profile.founder.isFollowing ? "Following" : "Follow"}
                    </Button>
                    <ModerationActions
                      targetType="profile"
                      targetId={profile.founder.id}
                      targetLabel={`@${profile.founder.handle}`}
                      authorHandle={profile.founder.handle}
                      onBlocked={() => setLocation("/")}
                    />
                  </>
                )}
              </div>
            </div>

            <div className="mb-3">
              <h2 className="text-2xl font-bold text-foreground leading-tight">{profile.founder.name}</h2>
              <p className="text-muted-foreground text-[15px]">@{profile.founder.handle}</p>
            </div>

            {profile.founder.bio && (
              <p className="text-foreground leading-relaxed mb-3 whitespace-pre-wrap text-[15px]">
                {profile.founder.bio}
              </p>
            )}

            {(profile.founder.location || profile.founder.website) && (
              <div className="flex flex-wrap gap-x-4 gap-y-2 text-muted-foreground mb-4 text-[15px]">
                {profile.founder.location && (
                  <div className="flex items-center gap-1">
                    <MapPin className="w-4 h-4" />
                    <span>{profile.founder.location}</span>
                  </div>
                )}
                {profile.founder.website && (
                  <div className="flex items-center gap-1">
                    <LinkIcon className="w-4 h-4" />
                    <a href={profile.founder.website.startsWith('http') ? profile.founder.website : `https://${profile.founder.website}`} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">
                      {profile.founder.website.replace(/^https?:\/\//, '')}
                    </a>
                  </div>
                )}
              </div>
            )}

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
              profile.posts.map(item => (
                <FeedItemCard key={item.feedItemKey} item={item} isFocused={item.type === "post" && item.post?.id === focusedPostId} />
              ))
            )}
          </div>
          
          <EditProfileDialog 
            profile={profile} 
            open={editDialogOpen} 
            onOpenChange={setEditDialogOpen} 
          />
        </div>
      )}
    </Layout>
  )
}

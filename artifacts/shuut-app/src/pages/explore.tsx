import { Layout } from "@/components/layout"
import { Search } from "lucide-react"

export default function Explore() {
  return (
    <Layout>
      <div className="sticky top-0 z-20 bg-background/80 backdrop-blur-md border-b border-border/50 px-6 py-4">
        <h1 className="text-xl font-bold text-foreground">Explore</h1>
      </div>
      
      <div className="p-12 text-center flex flex-col items-center">
        <div className="w-16 h-16 rounded-full bg-secondary flex items-center justify-center mb-6">
          <Search className="w-8 h-8 text-muted-foreground" />
        </div>
        <h2 className="text-xl font-bold mb-2">Search the noise</h2>
        <p className="text-muted-foreground">Find founders, topics, and signals.</p>
        <div className="mt-8 text-sm text-primary font-mono bg-primary/10 px-4 py-2 rounded-lg border border-primary/20">
          Coming soon
        </div>
      </div>
    </Layout>
  )
}

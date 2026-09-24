import { Link } from "wouter";
import { PublicLayout } from "@/components/public-layout";
import { usePublicPageMetadata } from "@/lib/public-page-meta";

export default function About() {
  usePublicPageMetadata("about");

  return (
    <PublicLayout>
      <article className="pb-6 text-gray-700">
        <header className="border-b border-gray-200 pb-10">
          <h1 className="mb-5 text-4xl font-extrabold tracking-tight text-gray-950 sm:text-5xl">About SHÜÜT</h1>
          <p className="text-lg font-medium leading-relaxed text-gray-900 sm:text-xl">SHÜÜT is a voice-first joint where people share short verbal messages and media, while other people listen and engage.</p>
        </header>

        <section aria-labelledby="what-shuut-does" className="border-b border-gray-200 py-10">
          <h2 id="what-shuut-does" className="mb-6 text-2xl font-bold tracking-tight text-gray-950">How SHÜÜT happens</h2>
          <div className="grid gap-7 sm:grid-cols-2">
            <div>
              <h3 className="mb-2 text-base font-bold text-gray-900">Speak, then share</h3>
              <p className="leading-relaxed">Record a short voice note. SHÜÜT turns your words into a transcript, so others can read the post or listen to the original recording.</p>
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold text-gray-900">Keep the voice with the words</h3>
              <p className="leading-relaxed">Text makes a conversation easy to scan and revisit. The recording keeps the pauses, tone and emphasis that text alone can miss.</p>
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold text-gray-900">Join the conversation</h3>
              <p className="leading-relaxed">Follow people, react to posts, reply with your voice and reSHÜÜT something you want to share with others.</p>
            </div>
            <div>
              <h3 className="mb-2 text-base font-bold text-gray-900">Explore a person’s thinking</h3>
              <p className="leading-relaxed">Visit a profile to hear what someone has shared over time. On eligible profiles, Ask Me lets you ask questions about earlier SHÜÜTs.</p>
            </div>
          </div>
        </section>

        <section aria-labelledby="who-its-for" className="border-b border-gray-200 py-10">
          <h2 id="who-its-for" className="mb-4 text-2xl font-bold tracking-tight text-gray-950">Who SHÜÜT is for</h2>
          <p className="leading-relaxed">
            People with something to say, and people who want to listen. You don’t need to be a broadcaster or a polished writer: a question, an observation or a thought worth sharing is enough.
          </p>
        </section>

        <section aria-labelledby="behind-shuut" className="border-b border-gray-200 py-10">
          <h2 id="behind-shuut" className="mb-4 text-2xl font-bold tracking-tight text-gray-950">The idea behind SHÜÜT</h2>
          <p className="leading-relaxed">
            Some things are easier to say aloud. SHÜÜT makes room for that immediacy without asking everyone else to listen to every recording in full. It is operated by{" "}
            <a href="https://doubleportrait.com/labs" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">DoublePortrait Labs</a>.
          </p>
        </section>

        <section aria-labelledby="key-facts" className="py-10">
          <h2 id="key-facts" className="mb-5 text-2xl font-bold tracking-tight text-gray-950">At a glance</h2>
          <dl className="divide-y divide-gray-200 rounded-xl border border-gray-200 bg-gray-50/60 px-5 sm:px-7">
            {[
              ["Name", "SHÜÜT (pronounced “shoot”)"],
              ["What it is", "A voice-note-first social platform"],
              ["How posts work", "Short voice recordings with readable transcripts and original audio"],
              ["Who it is for", "People who want to share thoughts and hear from others"],
              ["Operated by", "DoublePortrait Labs"],
            ].map(([term, detail]) => (
              <div key={term} className="grid gap-1 py-4 sm:grid-cols-[9rem_1fr] sm:gap-4">
                <dt className="text-sm font-semibold text-gray-900">{term}</dt>
                <dd className="text-sm leading-relaxed text-gray-700">{detail}</dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="faq" className="border-t border-gray-200 py-10">
          <h2 id="faq" className="mb-6 text-2xl font-bold tracking-tight text-gray-950">Frequently asked questions</h2>
          <div className="space-y-7">
            <div>
              <h3 className="mb-2 font-bold text-gray-900">Do I have to listen to every post?</h3>
              <p className="leading-relaxed">No. SHÜÜTs include readable transcripts, so you can scan what was said and choose when to play the original voice. Automated transcripts can sometimes make mistakes.</p>
            </div>
            <div>
              <h3 className="mb-2 font-bold text-gray-900">Can I reply without writing a comment?</h3>
              <p className="leading-relaxed">Yes. Replies are voice comments. You can also react to posts and reSHÜÜT a post with your own voice note.</p>
            </div>
            <div>
              <h3 className="mb-2 font-bold text-gray-900">Where can I learn about the community rules or get in touch?</h3>
              <p className="leading-relaxed">
                Read our <Link href="/community" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">Community Guidelines</Link> or{" "}
                <Link href="/contact" className="font-semibold text-blue-700 underline underline-offset-2 hover:text-blue-900">contact SHÜÜT</Link> with a question or feedback.
              </p>
            </div>
          </div>
        </section>
      </article>
    </PublicLayout>
  );
}
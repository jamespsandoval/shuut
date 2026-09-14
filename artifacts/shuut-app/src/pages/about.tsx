import { PublicLayout } from "@/components/public-layout";

export default function About() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-6">About SHÜÜT</h1>
      <div className="text-[17px] text-gray-700 leading-relaxed space-y-6">
        <p>
          SHÜÜT (pronounced "shoot") is a voice-centric social platform designed for authentic, frictionless communication.
        </p>
        <p>
          When you have something to say, you simply shoot over a voice message. Your words are automatically transcribed for others to read instantly, while the original voice recording remains available for anyone who wants to listen and hear the emotion, tone, and nuance behind your thoughts.
        </p>
      </div>
    </PublicLayout>
  );
}

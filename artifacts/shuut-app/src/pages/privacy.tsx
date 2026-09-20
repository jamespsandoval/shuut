import { PublicLayout } from "@/components/public-layout";

export default function Privacy() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 20 September 2026</p>

      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">1. Information We Collect</h2>
          <p>When you use SHÜÜT, we collect account information (such as your email and authentication details), profile information (such as your name, biography, avatar, and profile preferences), content you submit, and usage and technical information needed to operate and secure the service. This includes private voice recordings and the text transcripts generated from them. Recordings and transcripts are content associated with your account; a recording is not made public unless you choose to publish or share it.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">2. How We Use Your Information</h2>
          <p>We use this information to create and secure accounts, provide voice posting and commenting, display and deliver content you choose to share, generate transcripts, support moderation and appeals, communicate with you, prevent abuse, maintain security and audit records, and comply with legal obligations. Where applicable, processing is based on providing the service, our legitimate interests in a safe and functional platform, legal obligations, or your consent.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">3. Transcription & AI Processing</h2>
          <p>When you grant voice-AI consent and submit a recording, SHÜÜT sends the audio to ElevenLabs for speech-to-text. SHÜÜT sends transcript text to automated safety classification using OpenAI models through Replit-managed AI integrations. These steps can happen asynchronously after recording or upload. They support transcription and safety moderation; automated results can be wrong and may be reviewed or acted on under our policies. Revoking consent stops future voice processing and we send no new audio after revocation, but revocation does not retract content already submitted or processed.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">4. Data Sharing & Vendors</h2>
          <p>Service providers process information only to support SHÜÜT’s operation, including Replit-managed infrastructure and AI integrations, ElevenLabs speech-to-text, Postmark email processing, and Replit App Storage backed by Google Cloud infrastructure. Processing may occur in North America and internationally. We do not sell personal data, serve advertising, or use tracking.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">5. Retention & Deletion</h2>
          <p>Private recordings and transcripts are retained while the related content and account are active. Unlinked private uploads are cleaned up after signed-upload expiry and retry handling. When moderation removes content, its source audio is retained for 30 days to support an appeal. Report evidence, moderation actions and sanctions, and security, audit, or legal records may be retained or anonymized where needed for safety or legal purposes.</p>
          <p>Account deletion queues private audio and avatar cleanup and removes your profile, posts, comments, transcripts, current automated moderation jobs, and consent records after cleanup succeeds. Backups and copies held by providers follow their applicable processor or legal schedules. Current provider calls expose no per-request deletion ID, so SHÜÜT cannot promise immediate provider-side erasure; this does not change our commitment to send no new audio after consent is revoked.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">6. Your Data Protection Rights</h2>
          <p>Under applicable data protection law, including UK GDPR, you may have the right to access, rectify, erase, restrict, or object to the processing of your personal data, as well as the right to data portability and to withdraw consent where processing is based on consent. The rights available to you may depend on where you live. You can exercise these rights by managing your account settings or contacting us.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">7. Security & International Transfers</h2>
          <p>We implement reasonable technical and organizational safeguards to protect your data. Our primary deployment is in North America, and providers may process information internationally. Where required by applicable law, we use appropriate safeguards for international processing. We do not describe a specific transfer mechanism unless it has been verified for the relevant provider.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">8. Children's Privacy</h2>
          <p>SHÜÜT is intended for users who are 18 years of age or older. We do not knowingly collect personal data from children.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">9. Changes to this Policy</h2>
          <p>We may update this Privacy Policy periodically. Privacy changes affecting voice AI are disclosed through the versioned voice-AI consent prompt; continued use alone is not consent to a new voice-AI purpose. For privacy questions or requests, email <a href="mailto:privacy@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">privacy@shuut.me</a>.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

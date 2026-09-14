import { PublicLayout } from "@/components/public-layout";

export default function Privacy() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Privacy Policy</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 14 September 2026</p>

      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">1. Information We Collect</h2>
          <p>When you use SHÜÜT, we collect your account and email data, profile information, voice recordings, generated transcripts, and content you post. We also collect usage and technical data regarding how you interact with our platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">2. How We Use Your Information</h2>
          <p>We use this data to provide and improve the service, authenticate users, facilitate communications, and manage your account. The lawful bases under UK GDPR for processing include the performance of our contract with you and our legitimate interests in operating a secure and functional social platform.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">3. Transcription & AI Processing</h2>
          <p>Your voice recordings are processed to generate text transcripts and power AI agent interactions (like the "Ask Me" feature). This processing is fundamental to how SHÜÜT operates.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">4. Data Sharing & Vendors</h2>
          <p>We share your data with trusted third-party vendors who provide essential infrastructure, including hosting, authentication, storage, email delivery, and transcription services. For this deployment, our published app compute, database, and object storage are hosted in North America. We do not sell your personal data, nor do we use it for advertising purposes.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">5. Retention & Deletion</h2>
          <p>We retain your data for as long as your account is active. You may delete your account at any time, which will permanently erase your profile, voice recordings, and transcripts from our active systems.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">6. Your Data Protection Rights</h2>
          <p>Under applicable data protection law, including UK GDPR, you may have the right to access, rectify, erase, restrict, or object to the processing of your personal data, as well as the right to data portability and to withdraw consent where processing is based on consent. The rights available to you may depend on where you live. You can exercise these rights by managing your account settings or contacting us.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">7. Security & International Transfers</h2>
          <p>We implement reasonable security measures to protect your data. Our primary hosting infrastructure for this deployment is located in North America, so personal data may be transferred to and processed outside the United Kingdom. Some of our other service providers may also process information in countries outside the United Kingdom. Where required by applicable law, we use appropriate safeguards for these international transfers, such as adequacy regulations or approved contractual protections.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">8. Children's Privacy</h2>
          <p>SHÜÜT is intended for users who are 18 years of age or older. We do not knowingly collect personal data from children.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">9. Changes to this Policy</h2>
          <p>We may update this Privacy Policy periodically. We will notify you of significant changes, and your continued use of the platform will signify your acceptance. For privacy questions or requests, email <a href="mailto:privacy@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">privacy@shuut.me</a>.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

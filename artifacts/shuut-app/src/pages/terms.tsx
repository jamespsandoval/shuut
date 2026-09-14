import { PublicLayout } from "@/components/public-layout";

export default function Terms() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 14 September 2026</p>
      
      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">1. Introduction</h2>
          <p>Welcome to SHÜÜT. These Terms of Service govern your access to and use of the SHÜÜT platform, operated by DoublePortrait Labs in England and Wales. For this deployment, the published app, database, and object storage are hosted in an EU-based region selected through our hosting provider's regional hosting settings. This describes the location of our hosting infrastructure and does not change where DoublePortrait Labs is operated. By accessing or using our service, you agree to be bound by these Terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">2. Eligibility & Accounts</h2>
          <p>You must be at least 18 years old to use SHÜÜT. To use the service, you must register a verified email account. You are responsible for maintaining the security of your account and for all activities that occur under it.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">3. User Content</h2>
          <p>You retain ownership of the content you submit (voice recordings and profile information). By posting content on SHÜÜT, you grant DoublePortrait Labs a worldwide, royalty-free, non-exclusive license to host, transcribe, display, reproduce, and play your content in connection with providing the service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">4. Acceptable Use</h2>
          <p>You agree not to use the service to post abusive, harassing, defamatory, or illegal content. We reserve the right to remove any content or terminate accounts that violate these rules.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">5. Voice Transcription & AI</h2>
          <p>SHÜÜT relies on automated voice transcription and artificial intelligence features. These transcriptions are generated automatically and may contain errors. You acknowledge that AI interactions and transcriptions are provided "as is" without guarantees of perfect accuracy.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">6. Service Changes & Third Parties</h2>
          <p>We are constantly evolving and may modify or discontinue parts of the service at any time. We also rely on third-party providers (such as hosting, authentication, storage, and transcription services) to operate SHÜÜT. Our primary hosting infrastructure for this deployment is configured in an EU-based region, but individual third-party providers may have their own processing locations and terms.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">7. Termination & Deletion</h2>
          <p>You can delete your account at any time. We may suspend or terminate your account if you violate these Terms. Upon deletion, your profile and content will be permanently removed.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">8. Disclaimer of Warranties & Liability</h2>
          <p>The service is provided on an "as is" and "as available" basis without any warranties. DoublePortrait Labs shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">9. Governing Law</h2>
          <p>These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to its conflict of law provisions.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">10. Updates & Contact</h2>
          <p>We may update these Terms from time to time. Your continued use of the service constitutes acceptance of any changes. For questions about these Terms, email <a href="mailto:terms@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">terms@shuut.me</a>.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

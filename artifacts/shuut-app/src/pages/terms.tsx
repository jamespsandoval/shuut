import { PublicLayout } from "@/components/public-layout";
import { usePublicPageMetadata } from "@/lib/public-page-meta";

export default function Terms() {
  usePublicPageMetadata("terms");
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Terms of Service</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 23 September 2026</p>
      
      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">1. Introduction</h2>
          <p>Welcome to SHÜÜT. These Terms of Service govern your access to and use of the SHÜÜT platform, operated by DoublePortrait Labs in England and Wales. By accessing or using our service, you agree to be bound by these Terms.</p>
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
          <h2 className="text-lg font-bold text-gray-900 mb-2">4. Acceptable Use and Zero-Tolerance Policy</h2>
          <p className="mb-4">You agree not to use the service to post abusive, harassing, defamatory, or illegal content. We maintain a strict zero-tolerance policy against the following prohibited content taxonomy:</p>
          <ul className="list-disc pl-5 space-y-2 mb-4">
            <li>Hate speech, discrimination, or incitement of violence against any protected group.</li>
            <li>Harassment, bullying, or targeted abuse of individuals.</li>
            <li>Child sexual abuse material (CSAM) or any content exploiting minors.</li>
            <li>Terrorist content or violent extremism.</li>
            <li>Non-consensual sexual content or revenge pornography.</li>
            <li>Illegal goods, services, or activities.</li>
            <li>Spam, automated abuse, or malicious software.</li>
          </ul>
          <p>Violations may result in immediate content removal, feature restrictions, temporary suspension, or permanent account termination. We may preserve and disclose information where required by law and report apparent criminal conduct to the appropriate authorities.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">5. Enforcement, Reporting, and Appeals</h2>
          <p className="mb-4">We rely on community reporting to enforce our policies on a case-by-case basis. You can report violations directly by using our <a href={`${import.meta.env.BASE_URL}contact`} className="font-medium text-gray-900 underline underline-offset-2">contact form</a> or emailing <a href="mailto:contact@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">contact@shuut.me</a>.</p>
          <p className="mb-4">We are committed to reviewing urgent safety reports promptly. Our target is to take initial action on all safety reports within 24 hours of receipt.</p>
          <p>If we take enforcement action against your account or content, you have the right to appeal the decision. Appeals must be submitted within 30 days of the enforcement action by contacting our support team.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">6. Voice Transcription & AI</h2>
          <p>SHÜÜT relies on automated voice transcription and artificial intelligence features. These transcriptions are generated automatically and may contain errors. You acknowledge that AI interactions and transcriptions are provided "as is" without guarantees of perfect accuracy.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">7. Service Changes & Third Parties</h2>
          <p>We are constantly evolving and may modify or discontinue parts of the service at any time. We also rely on third-party providers (such as hosting, authentication, storage, email delivery, transcription, and analytics services) to operate and improve SHÜÜT. We currently use PostHog for limited product analytics and may use other analytics providers in the future, with updates to our Privacy Policy identifying their use. Those providers and their subprocessors may process information in multiple countries under their applicable terms. Our Privacy Policy describes the analytics information we collect and how to contact us about your data.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">8. Termination & Deletion</h2>
          <p>You can delete your account at any time. We may suspend or terminate your account if you violate these Terms. Upon deletion, your profile and content will be permanently removed.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">9. Disclaimer of Warranties & Liability</h2>
          <p>The service is provided on an "as is" and "as available" basis without any warranties. DoublePortrait Labs shall not be liable for any indirect, incidental, or consequential damages arising from your use of the service.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">10. Governing Law</h2>
          <p>These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to its conflict of law provisions.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">11. Updates & Contact</h2>
          <p>We may update these Terms from time to time. When an update materially changes your rights or responsibilities, we will ask you to review and accept the new version before you can continue participating in the community. For questions about these Terms, email <a href="mailto:terms@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">terms@shuut.me</a>.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

import { PublicLayout } from "@/components/public-layout";

export default function Community() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-6">Community Guidelines</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 20 September 2026</p>
      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Our Core Principles</h2>
          <p className="mb-4">Be direct, be helpful, and contribute constructively. SHÜÜT is a space for founders to share unvarnished realities, learn from one another, and build authentic connections.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Zero-Tolerance for Prohibited Content</h2>
          <p className="mb-4">We enforce a strict zero-tolerance taxonomy for harmful content. You must not post, share, or engage in:</p>
          <ul className="list-disc pl-5 space-y-2 mb-4">
            <li>Hate speech or discriminatory language targeting any group.</li>
            <li>Harassment, stalking, doxxing, or coordinated abuse.</li>
            <li>Child sexual exploitation or abuse material.</li>
            <li>Terrorism or violent extremism promotion.</li>
            <li>Non-consensual explicit media.</li>
            <li>Promotion of illegal acts, substances, or services.</li>
            <li>Spam, manipulation, or automated abuse.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Moderation and Enforcement</h2>
          <p className="mb-4">We are dedicated to keeping SHÜÜT safe. We review manual reports on a case-by-case basis and take action based on severity. Actions may include content removal, feature restrictions, temporary suspension, or permanent account termination.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Reporting and Response Commitments</h2>
          <p className="mb-4">If you encounter content or behavior that violates these guidelines, please report it through our <a href={`${import.meta.env.BASE_URL}contact`} className="font-medium text-gray-900 underline underline-offset-2">contact form</a> and include the account, post, or comment involved.</p>
          <p className="mb-4">We commit to evaluating all urgent safety and harm reports promptly, targeting initial review and action within 24 hours of submission.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-gray-900 mb-3">Appeals</h2>
          <p>If you believe a moderation decision was made in error, you may submit an appeal. We review appeals on a case-by-case basis to ensure fairness and accuracy in our enforcement. Contact support to initiate an appeal.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

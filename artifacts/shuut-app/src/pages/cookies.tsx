import { PublicLayout } from "@/components/public-layout";

export default function Cookies() {
  return (
    <PublicLayout>
      <h1 className="text-3xl font-extrabold tracking-tight mb-2">Cookie Policy</h1>
      <p className="text-sm font-medium text-gray-400 mb-10 uppercase tracking-wider">Effective: 14 September 2026</p>

      <div className="space-y-8 text-[15px] text-gray-700 leading-relaxed">
        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">1. What Are Cookies?</h2>
          <p>Cookies and local storage are small data files placed on your device when you visit a website. They help the site function properly and remember your preferences.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">2. How We Use Cookies</h2>
          <p>SHÜÜT uses strictly necessary cookies and local storage primarily for authentication and session management. These ensure that you remain securely logged in as you navigate the platform. We also use them to store small functional preferences (like your theme choice).</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">3. No Advertising Cookies</h2>
          <p>We do not use advertising or tracking cookies. Analytics cookies may only be introduced in the future with your explicit consent.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">4. Managing Your Cookies</h2>
          <p>You can manage or disable cookies through your browser settings. Please note that disabling strictly necessary cookies will prevent you from logging in and using SHÜÜT.</p>
        </section>

        <section>
          <h2 className="text-lg font-bold text-gray-900 mb-2">5. Updates</h2>
          <p>We may update this Cookie Policy from time to time. Please review it periodically. If you have any questions, email <a href="mailto:cookies@shuut.me" className="font-medium text-gray-900 underline underline-offset-2">cookies@shuut.me</a>.</p>
        </section>
      </div>
    </PublicLayout>
  );
}

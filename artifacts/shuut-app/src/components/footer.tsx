import { Link } from 'wouter';

export function Footer() {
  const footerLinks = [
    { label: "About", href: "/about" },
    { label: "Community Guidelines", href: "/community" },
    { label: "Contact", href: "/contact" },
    { label: "Terms of Service", href: "/terms" },
    { label: "Privacy Policy", href: "/privacy" },
    { label: "Cookie Policy", href: "/cookies" },
  ];

  return (
    <footer className="w-full px-6 pt-10 pb-[calc(2.5rem+env(safe-area-inset-bottom))] border-t border-gray-100 bg-white z-10 shrink-0">
      <div className="max-w-screen-lg mx-auto flex flex-col items-center gap-6">
        <div className="flex flex-wrap justify-center items-center gap-x-3 gap-y-3 text-[13px] text-gray-500 font-medium">
          {footerLinks.map((link, i) => (
            <div key={link.label} className="flex items-center gap-3">
              <Link href={link.href} className="hover:text-gray-900 transition-colors">
                {link.label}
              </Link>
              {i < footerLinks.length - 1 && (
                <span className="text-gray-300 font-light" aria-hidden="true">|</span>
              )}
            </div>
          ))}
        </div>
        <p className="text-[13px] text-gray-400 font-medium text-center">
          © 2026 SHÜÜT — A{" "}
          <a
            href="https://doubleportrait.com/labs"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-gray-900 hover:underline transition-colors"
          >
            DoublePortrait Labs
          </a>{" "}
          Production. All rights reserved.
        </p>
      </div>
    </footer>
  );
}

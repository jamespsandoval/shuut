import { ReactNode } from 'react';
import { Link } from 'wouter';
import { Footer } from './footer';
import { ArrowLeft } from 'lucide-react';

export function PublicLayout({ children }: { children: ReactNode }) {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <div className="w-full p-6 flex items-center justify-between">
        <Link href="/" className="inline-flex items-center text-sm font-medium text-muted-foreground hover:text-gray-900 transition-colors">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to home
        </Link>
      </div>
      
      <main className="flex-1 flex flex-col items-center px-6 pb-20 w-full max-w-2xl mx-auto">
        <div className="w-full flex justify-center mb-16">
          <Link href="/">
            <img src={`${basePath}/logo.svg`} alt="SHÜÜT" className="h-[60px] md:h-[80px]" />
          </Link>
        </div>
        
        <div className="w-full">
          {children}
        </div>
      </main>
      
      <Footer />
    </div>
  );
}

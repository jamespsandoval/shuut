import { useState } from 'react';
import { useSignIn, useSignUp } from '@clerk/react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, ArrowLeft } from 'lucide-react';
import { Footer } from '@/components/footer';

export default function Landing() {
  const [mode, setMode] = useState<'sign-in' | 'sign-up'>('sign-up');
  const [step, setStep] = useState<'email' | 'code'>('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signUp } = useSignUp();
  const { signIn } = useSignIn();

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp || !signIn) return;
    
    setPending(true);
    setError(null);
    
    try {
      if (mode === 'sign-up') {
        const { error: createError } = await signUp.create({ emailAddress: email });
        if (createError) throw createError;
        
        const { error: sendError } = await signUp.verifications.sendEmailCode();
        if (sendError) throw sendError;
        
        setStep('code');
      } else {
        const { error: sendError } = await signIn.emailCode.sendCode({ emailAddress: email });
        if (sendError) throw sendError;
        
        setStep('code');
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "An error occurred");
    } finally {
      setPending(false);
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!signUp || !signIn) return;

    setPending(true);
    setError(null);
    
    try {
      if (mode === 'sign-up') {
        const { error: verifyError } = await signUp.verifications.verifyEmailCode({ code });
        if (verifyError) throw verifyError;
        
        const { error: finalizeError } = await signUp.finalize();
        if (finalizeError) throw finalizeError;
      } else {
        const { error: verifyError } = await signIn.emailCode.verifyCode({ code });
        if (verifyError) throw verifyError;
        
        const { error: finalizeError } = await signIn.finalize();
        if (finalizeError) throw finalizeError;
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.errors?.[0]?.message || err.message || "Invalid code");
    } finally {
      setPending(false);
    }
  };
  
  const resetFlow = () => {
    setStep('email');
    setCode('');
    setError(null);
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[400px] mx-auto relative z-10">
        <div className="w-full flex flex-col items-center justify-center mb-12">
          <img src={`${basePath}/logo.svg`} alt="SHÜÜT" className="h-[120px] max-h-[15vh] w-auto" />
          <p className="mt-4 text-xl font-medium text-gray-600 text-center">Say what's your mind</p>
        </div>

        <div className="w-full">
          {error && (
            <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2 border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-900 rounded-xl">
              <AlertDescription className="font-medium text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {step === 'email' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <h1 className="text-[28px] font-extrabold tracking-tight text-center mb-2 leading-tight">
                {mode === 'sign-up' ? 'Create an account' : 'Welcome back'}
              </h1>
              <p className="text-muted-foreground text-center text-sm font-medium mb-8">
                {mode === 'sign-up' 
                  ? 'Enter your email to get started'
                  : 'Enter your email to sign in'}
              </p>

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Input
                    type="email"
                    placeholder="name@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={pending}
                    className="h-14 text-[15px] px-4 rounded-xl bg-gray-50/80 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary transition-all placeholder:text-gray-400 font-medium text-gray-900"
                    autoFocus
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98] shadow-sm hover:shadow-md bg-primary hover:bg-primary/90 text-white"
                  disabled={pending || !email}
                >
                  {pending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     <>{mode === 'sign-up' ? 'Continue' : 'Sign in'} <ArrowRight className="w-4 h-4 ml-2 opacity-80" /></>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center text-sm text-muted-foreground font-medium">
                {mode === 'sign-up' ? 'Already have an account?' : 'New to SHÜÜT?'}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                    setError(null);
                  }}
                  className="ml-1.5 font-bold text-gray-900 hover:text-primary transition-colors"
                  disabled={pending}
                >
                  {mode === 'sign-up' ? 'Sign in' : 'Create account'}
                </button>
              </div>
            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <button 
                onClick={resetFlow}
                type="button"
                className="mb-8 flex items-center text-sm font-semibold text-muted-foreground hover:text-gray-900 transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </button>
              
              <h1 className="text-[28px] font-extrabold tracking-tight mb-2 leading-tight">
                Check your email
              </h1>
              <p className="text-muted-foreground text-sm font-medium mb-8 leading-relaxed">
                We sent a 6-digit verification code to <br/>
                <span className="font-bold text-gray-900">{email}</span>
              </p>

              <form onSubmit={handleCodeSubmit} className="space-y-6">
                <div className="space-y-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="\d{6}"
                    maxLength={6}
                    placeholder="000000"
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    required
                    disabled={pending}
                    className="h-16 text-center text-[28px] tracking-[0.5em] font-mono font-semibold rounded-xl bg-gray-50/80 border-gray-200 focus-visible:ring-primary/20 focus-visible:border-primary transition-all text-gray-900 placeholder:text-gray-300"
                    autoFocus
                  />
                </div>
                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[15px] font-semibold transition-all active:scale-[0.98] shadow-sm hover:shadow-md bg-primary hover:bg-primary/90 text-white"
                  disabled={pending || code.length !== 6}
                >
                  {pending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     "Verify code"
                  )}
                </Button>
              </form>
            </div>
          )}
        </div>
      </main>

      <Footer />
    </div>
  );
}
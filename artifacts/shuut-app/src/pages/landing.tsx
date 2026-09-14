import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { Footer } from '@/components/footer';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useRegister, 
  useVerifyEmail, 
  useLogin, 
  useVerifyLogin,
  getGetCurrentUserQueryKey
} from '@workspace/api-client-react';

type AuthMode = 'sign-in' | 'sign-up' | 'verify-email' | 'verify-login';

export default function Landing() {
  const [mode, setMode] = useState<AuthMode>('sign-up');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  
  const registerMutation = useRegister();
  const verifyEmailMutation = useVerifyEmail();
  const loginMutation = useLogin();
  const verifyLoginMutation = useVerifyLogin();

  const isPending = 
    registerMutation.isPending || 
    verifyEmailMutation.isPending || 
    loginMutation.isPending || 
    verifyLoginMutation.isPending;

  const extractError = (err: any) => {
    return err?.message || err?.error || err?.response?.data?.message || "An unexpected error occurred.";
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (mode === 'sign-up') {
      registerMutation.mutate({ data: { email } }, {
        onSuccess: () => {
          setMode('verify-email');
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    } else if (mode === 'sign-in') {
      loginMutation.mutate({ data: { email } }, {
        onSuccess: () => {
          setMode('verify-login');
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    }
  };

  const handleCodeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (mode === 'verify-email') {
      verifyEmailMutation.mutate({ data: { email, code } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    } else if (mode === 'verify-login') {
      verifyLoginMutation.mutate({ data: { email, code } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    }
  };
  
  const resetFlow = () => {
    if (mode === 'verify-email') setMode('sign-up');
    else if (mode === 'verify-login') setMode('sign-in');
    
    setCode('');
    setError(null);
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[420px] mx-auto relative z-10">
        <div className="relative w-full flex flex-col items-center justify-center mb-10">
          <img src={`${basePath}/logo.svg`} alt="SHÜÜT" className="h-[100px] w-auto" />
          <p className="-mt-2 text-[17px] font-semibold text-muted-foreground text-center tracking-tight">
            Say what's on your mind
          </p>
        </div>

        <div className="w-full">
          {error && (
            <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2 border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-900 rounded-xl">
              <AlertDescription className="font-medium text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {(mode === 'sign-up' || mode === 'sign-in') ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {mode === 'sign-in' && (
                <h1 className="text-3xl font-extrabold tracking-tight text-center mb-2 leading-tight text-foreground">
                  Welcome back
                </h1>
              )}
              {mode === 'sign-in' && (
                <p className="text-muted-foreground text-center text-[15px] font-medium mb-8">
                  Enter your email to receive a sign-in code.
                </p>
              )}

              <form onSubmit={handleEmailSubmit} className="space-y-4">
                <div className="space-y-4">
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-muted-foreground" />
                    </div>
                    <Input
                      type="email"
                      autoComplete="email"
                      placeholder="Email address"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      disabled={isPending}
                      className="h-14 text-[15px] pl-11 rounded-xl bg-secondary/50 border-transparent focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all placeholder:text-muted-foreground font-medium"
                      autoFocus
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md mt-4"
                  disabled={isPending || !email}
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     <>
                       {mode === 'sign-up' ? 'Continue' : 'Send sign-in code'} 
                       <ArrowRight className="w-5 h-5 ml-2 opacity-80" />
                     </>
                  )}
                </Button>
              </form>

              <div className="mt-8 text-center text-[15px] text-muted-foreground font-medium">
                {mode === 'sign-up' ? 'Already have an account?' : 'New to SHÜÜT?'}
                <button
                  type="button"
                  onClick={() => {
                    setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                    setError(null);
                  }}
                  className="ml-2 font-bold text-foreground hover:text-primary transition-colors"
                  disabled={isPending}
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
                className="mb-8 flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </button>
              
              <h1 className="text-3xl font-extrabold tracking-tight mb-2 leading-tight">
                Check your email
              </h1>
              <p className="text-muted-foreground text-[15px] font-medium mb-8 leading-relaxed">
                We sent a 6-digit code to <br/>
                <span className="font-bold text-foreground">{email}</span>
              </p>

              <form onSubmit={handleCodeSubmit} className="space-y-6">
                <div className="space-y-6">
                  <div className="space-y-2">
                    <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">Verification Code</label>
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <KeyRound className="h-5 w-5 text-muted-foreground opacity-50" />
                      </div>
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
                        disabled={isPending}
                        className="h-16 text-center text-2xl tracking-[0.5em] font-mono font-bold rounded-xl bg-secondary/50 border-transparent focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all placeholder:text-muted-foreground/30"
                        autoFocus
                      />
                    </div>
                  </div>

                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md mt-2"
                  disabled={isPending || code.length !== 6}
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     "Verify & Sign in"
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
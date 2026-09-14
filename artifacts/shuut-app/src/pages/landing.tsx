import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, ArrowLeft, Mail, KeyRound } from 'lucide-react';
import { Footer } from '@/components/footer';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useStartAuth,
  useVerifyEmail, 
  useVerifyLogin,
  getGetCurrentUserQueryKey
} from '@workspace/api-client-react';

type AuthMode = 'email' | 'verify';
type AuthFlow = 'login' | 'register';

export default function Landing() {
  const [mode, setMode] = useState<AuthMode>('email');
  const [flow, setFlow] = useState<AuthFlow | null>(null);
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  
  const startAuthMutation = useStartAuth();
  const verifyEmailMutation = useVerifyEmail();
  const verifyLoginMutation = useVerifyLogin();

  const isPending = 
    startAuthMutation.isPending ||
    verifyEmailMutation.isPending || 
    verifyLoginMutation.isPending;

  const extractError = (err: any) => {
    return err?.message || err?.error || err?.response?.data?.message || "An unexpected error occurred.";
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    startAuthMutation.mutate({ data: { email } }, {
      onSuccess: (result) => {
        setFlow(result.flow);
        setMode('verify');
      },
      onError: (err) => {
        setError(extractError(err));
      }
    });
  };

  const submitCode = (codeToVerify: string) => {
    if (codeToVerify.length !== 6 || verifyEmailMutation.isPending || verifyLoginMutation.isPending) {
      return;
    }
    setError(null);
    
    if (flow === 'register') {
      verifyEmailMutation.mutate({ data: { email, code: codeToVerify } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    } else if (flow === 'login') {
      verifyLoginMutation.mutate({ data: { email, code: codeToVerify } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    }
  };

  const handleCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCode(code);
  };
  
  const resetFlow = () => {
    setMode('email');
    setFlow(null);
    setCode('');
    setError(null);
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[420px] mx-auto relative z-10">
        <div className="relative w-full flex flex-col items-center justify-center mb-10">
          <img src={`${basePath}/shuut-logo.png`} alt="SHÜÜT" className="h-[100px] w-auto" />
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

          {mode === 'email' ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              <form
                onSubmit={handleEmailSubmit}
                className="space-y-2 pt-4"
              >
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
                      className="h-14 text-[15px] pl-11 rounded-xl bg-white border-slate-300 shadow-sm hover:border-slate-400 focus-visible:bg-white focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all placeholder:text-muted-foreground font-medium"
                      autoFocus
                      data-testid="input-auth-email"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md"
                  disabled={isPending || !email}
                  data-testid="button-auth-continue"
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     <>
                       Continue
                       <ArrowRight className="w-5 h-5 ml-2 opacity-80" />
                     </>
                  )}
                </Button>
              </form>

            </div>
          ) : (
            <div className="animate-in fade-in slide-in-from-right-4 duration-300">
              <button 
                onClick={resetFlow}
                type="button"
                className="mb-8 flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                data-testid="button-auth-back"
              >
                <ArrowLeft className="w-4 h-4 mr-1.5" />
                Back
              </button>
              
              <h1 className="text-3xl font-extrabold tracking-tight mb-2 leading-tight" data-testid="heading-auth-code">
                {flow === 'register' ? 'Create your account' : 'Check your email'}
              </h1>
              <p className="text-muted-foreground text-[15px] font-medium mb-8 leading-relaxed">
                {flow === 'register'
                  ? "We didn't find an account for this email. Enter the code we sent to continue registration."
                  : 'We sent a 6-digit sign-in code to'}
                <br/>
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
                        onChange={(e) => {
                          const nextCode = e.target.value.replace(/\D/g, '').slice(0, 6);
                          setCode(nextCode);
                          setError(null);
                          if (nextCode.length === 6) submitCode(nextCode);
                        }}
                        required
                        disabled={isPending}
                        className="h-16 text-center text-2xl tracking-[0.5em] font-mono font-bold rounded-xl bg-secondary/50 border-transparent focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all placeholder:text-muted-foreground/30"
                        autoFocus
                        data-testid="input-auth-code"
                      />
                    </div>
                  </div>

                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md mt-2"
                  disabled={isPending || code.length !== 6}
                  data-testid="button-auth-verify"
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     flow === 'register' ? "Verify & continue" : "Verify & sign in"
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
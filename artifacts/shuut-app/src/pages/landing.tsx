import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, ArrowRight, ArrowLeft, Mail, Lock, KeyRound } from 'lucide-react';
import { Footer } from '@/components/footer';
import { useQueryClient } from '@tanstack/react-query';
import { 
  useRegister, 
  useVerifyEmail, 
  useLogin, 
  useForgotPassword, 
  useResetPassword,
  getGetCurrentUserQueryKey
} from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

type AuthMode = 'sign-in' | 'sign-up' | 'verify-email' | 'forgot-password' | 'reset-password';

export default function Landing() {
  const [mode, setMode] = useState<AuthMode>('sign-up');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const registerMutation = useRegister();
  const verifyEmailMutation = useVerifyEmail();
  const loginMutation = useLogin();
  const forgotPasswordMutation = useForgotPassword();
  const resetPasswordMutation = useResetPassword();

  const isPending = 
    registerMutation.isPending || 
    verifyEmailMutation.isPending || 
    loginMutation.isPending || 
    forgotPasswordMutation.isPending || 
    resetPasswordMutation.isPending;

  const extractError = (err: any) => {
    return err?.message || err?.error || err?.response?.data?.message || "An unexpected error occurred.";
  };

  const handleEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    
    if (mode === 'sign-up') {
      registerMutation.mutate({ data: { email, password } }, {
        onSuccess: () => {
          setMode('verify-email');
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    } else if (mode === 'sign-in') {
      loginMutation.mutate({ data: { email, password } }, {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    } else if (mode === 'forgot-password') {
      forgotPasswordMutation.mutate({ data: { email } }, {
        onSuccess: () => {
          setMode('reset-password');
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
    } else if (mode === 'reset-password') {
      resetPasswordMutation.mutate({ data: { email, code, password } }, {
        onSuccess: () => {
          toast({ title: "Password reset successful", description: "You can now sign in with your new password." });
          setMode('sign-in');
          setPassword('');
          setCode('');
          setError(null);
        },
        onError: (err) => {
          setError(extractError(err));
        }
      });
    }
  };
  
  const resetFlow = () => {
    if (mode === 'verify-email') setMode('sign-up');
    else if (mode === 'reset-password') setMode('forgot-password');
    else if (mode === 'forgot-password') setMode('sign-in');
    
    setCode('');
    setError(null);
  };

  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-foreground">
      <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-[420px] mx-auto relative z-10">
        <div className="relative w-full flex flex-col items-center justify-center mb-10">
          <img src={`${basePath}/logo.svg`} alt="SHÜÜT" className="h-[100px] w-auto mb-2" />
          <p className="text-[17px] font-semibold text-muted-foreground text-center tracking-tight">
            Say what's on your mind
          </p>
        </div>

        <div className="w-full">
          {error && (
            <Alert variant="destructive" className="mb-6 animate-in fade-in slide-in-from-top-2 border-red-200 bg-red-50 text-red-900 [&>svg]:text-red-900 rounded-xl">
              <AlertDescription className="font-medium text-sm">{error}</AlertDescription>
            </Alert>
          )}

          {(mode === 'sign-up' || mode === 'sign-in' || mode === 'forgot-password') ? (
            <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
              {mode === 'forgot-password' && (
                <button 
                  onClick={resetFlow}
                  type="button"
                  className="mb-6 flex items-center text-sm font-semibold text-muted-foreground hover:text-foreground transition-colors"
                >
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to sign in
                </button>
              )}
              
              <h1 className="text-3xl font-extrabold tracking-tight text-center mb-2 leading-tight text-foreground">
                {mode === 'sign-up' ? 'Create your account' : mode === 'sign-in' ? 'Welcome back' : 'Reset password'}
              </h1>
              <p className="text-muted-foreground text-center text-[15px] font-medium mb-8">
                {mode === 'sign-up' 
                  ? 'Join the voice-first founder community.'
                  : mode === 'sign-in'
                  ? 'Sign in to hear what founders are saying.'
                  : 'Enter your email to receive a reset code.'}
              </p>

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
                  
                  {mode !== 'forgot-password' && (
                    <div className="relative">
                      <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                        <Lock className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <Input
                        type="password"
                        autoComplete={mode === 'sign-in' ? 'current-password' : 'new-password'}
                        placeholder="Password"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        required
                        disabled={isPending}
                        minLength={10}
                        className="h-14 text-[15px] pl-11 rounded-xl bg-secondary/50 border-transparent focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all placeholder:text-muted-foreground font-medium"
                      />
                    </div>
                  )}
                </div>

                {mode === 'sign-in' && (
                  <div className="flex justify-end pt-1">
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot-password');
                        setError(null);
                      }}
                      className="text-sm font-bold text-muted-foreground hover:text-primary transition-colors"
                      disabled={isPending}
                    >
                      Forgot password?
                    </button>
                  </div>
                )}

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md mt-4"
                  disabled={isPending || !email || (mode !== 'forgot-password' && !password)}
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     <>
                       {mode === 'sign-up' ? 'Continue' : mode === 'sign-in' ? 'Sign in' : 'Send reset code'} 
                       <ArrowRight className="w-5 h-5 ml-2 opacity-80" />
                     </>
                  )}
                </Button>
              </form>

              {mode !== 'forgot-password' && (
                <div className="mt-8 text-center text-[15px] text-muted-foreground font-medium">
                  {mode === 'sign-up' ? 'Already have an account?' : 'New to SHÜÜT?'}
                  <button
                    type="button"
                    onClick={() => {
                      setMode(mode === 'sign-up' ? 'sign-in' : 'sign-up');
                      setError(null);
                      setPassword('');
                    }}
                    className="ml-2 font-bold text-foreground hover:text-primary transition-colors"
                    disabled={isPending}
                  >
                    {mode === 'sign-up' ? 'Sign in' : 'Create account'}
                  </button>
                </div>
              )}
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
                {mode === 'verify-email' ? 'Check your email' : 'Set new password'}
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

                  {mode === 'reset-password' && (
                    <div className="space-y-2 animate-in fade-in slide-in-from-bottom-2">
                      <label className="text-sm font-bold text-muted-foreground uppercase tracking-wider ml-1">New Password</label>
                      <div className="relative">
                        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
                          <Lock className="h-5 w-5 text-muted-foreground" />
                        </div>
                        <Input
                          type="password"
                          placeholder="Must be at least 10 characters"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          required
                          minLength={10}
                          disabled={isPending}
                          className="h-14 text-[15px] pl-11 rounded-xl bg-secondary/50 border-transparent focus-visible:bg-transparent focus-visible:ring-1 focus-visible:ring-primary focus-visible:border-primary transition-all font-medium"
                        />
                      </div>
                    </div>
                  )}
                </div>

                <Button 
                  type="submit" 
                  className="w-full h-14 rounded-xl text-[16px] font-bold transition-all active:scale-[0.98] shadow-sm hover:shadow-md mt-2"
                  disabled={isPending || code.length !== 6 || (mode === 'reset-password' && password.length < 10)}
                >
                  {isPending ? (
                     <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                     mode === 'verify-email' ? "Verify & Sign in" : "Reset Password"
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
import { useState } from 'react';
import { useAcceptLegalPolicyConsent, getGetCurrentUserQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Link } from 'wouter';
import { AlertCircle, FileText } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useAuth } from '@/hooks/use-auth';

export default function LegalConsentGate() {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const acceptConsent = useAcceptLegalPolicyConsent();
  const [error, setError] = useState<string | null>(null);

  const handleAccept = () => {
    if (!user?.legalPolicyConsent) return;
    
    setError(null);
    acceptConsent.mutate(
      { 
        data: { 
          source: 'web',
          termsVersion: user.legalPolicyConsent.terms.currentVersion,
          communityGuidelinesVersion: user.legalPolicyConsent.communityGuidelines.currentVersion
        } 
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
        },
        onError: (err: any) => {
          // Handle version mismatch (409 Conflict)
          if (
            err?.response?.status === 409 || 
            err?.status === 409 || 
            err?.response?.data?.code === 'LEGAL_POLICY_VERSION_MISMATCH' || 
            err?.code === 'LEGAL_POLICY_VERSION_MISMATCH'
          ) {
            queryClient.invalidateQueries({ queryKey: getGetCurrentUserQueryKey() });
            setError("The policies have been updated since you opened this page. Please review the new versions before accepting.");
          } else {
            setError("We couldn't record your acceptance. Please try again or contact support if the issue persists.");
          }
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col bg-white text-gray-900">
      <div className="flex-1 flex flex-col items-center justify-center px-6 max-w-xl mx-auto w-full py-12">
        <div className="w-full space-y-10">
          <div className="space-y-4">
            <h1 className="text-3xl font-extrabold tracking-tight">Policy Updates</h1>
            <p className="text-[17px] text-gray-600 leading-relaxed">
              To keep SHÜÜT a secure, high-signal space for founders, we have introduced a strict, zero-tolerance policy against harmful content.
            </p>
            <p className="text-[17px] text-gray-600 leading-relaxed">
              We require all members to read and accept the updated guidelines to continue participating in the community.
            </p>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-start space-y-3">
              <div className="h-10 w-10 bg-gray-200 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-gray-700" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-gray-900">Terms of Service</h3>
                <p className="text-sm text-gray-500">Legal commitments and platform rules.</p>
              </div>
              <Link href="/terms" className="text-sm font-medium hover:underline text-gray-900 mt-auto pt-2 block w-full">
                Read full terms &rarr;
              </Link>
            </div>
            
            <div className="p-5 bg-gray-50 rounded-xl border border-gray-100 flex flex-col items-start space-y-3">
              <div className="h-10 w-10 bg-gray-200 rounded-lg flex items-center justify-center">
                <FileText className="h-5 w-5 text-gray-700" />
              </div>
              <div className="space-y-1">
                <h3 className="font-semibold text-gray-900">Community Guidelines</h3>
                <p className="text-sm text-gray-500">Acceptable behavior and enforcement.</p>
              </div>
              <Link href="/community" className="text-sm font-medium hover:underline text-gray-900 mt-auto pt-2 block w-full">
                Read guidelines &rarr;
              </Link>
            </div>
          </div>

          {error && (
            <Alert variant="destructive" className="bg-red-50 text-red-900 border-red-200">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="pt-4 border-t border-gray-100 space-y-4">
            <Button 
              className="w-full h-14 text-base font-bold rounded-xl"
              onClick={handleAccept}
              disabled={acceptConsent.isPending}
              data-testid="button-accept-policies"
            >
              {acceptConsent.isPending ? "Recording acceptance..." : "I have read and accept"}
            </Button>
            <p className="text-sm text-center text-gray-500">
              By accepting, you agree to comply with our updated policies and acknowledge our zero-tolerance enforcement standards.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

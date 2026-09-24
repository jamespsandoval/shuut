import { FormEvent, useState } from "react";
import { useSendContactMessage } from "@workspace/api-client-react";
import { PublicLayout } from "@/components/public-layout";
import { usePublicPageMetadata } from "@/lib/public-page-meta";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

const MAX_MESSAGE_LENGTH = 1000;

export default function Contact() {
  usePublicPageMetadata("contact");
  const isNativeApp = typeof window !== 'undefined'
    && new URLSearchParams(window.location.search).get('native') === '1';
  const sendMessage = useSendContactMessage();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [consent, setConsent] = useState(false);
  const [website, setWebsite] = useState("");
  const [sent, setSent] = useState(false);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!consent) return;
    sendMessage.mutate(
      {
        data: {
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          email: email.trim(),
          message: message.trim(),
          consent: true,
          website,
        },
      },
      {
        onSuccess: () => setSent(true),
      },
    );
  };

  if (sent) {
    return (
      <PublicLayout>
        <div className="mx-auto max-w-xl text-center py-14">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 mb-4">
            Message sent
          </p>
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 mb-4">
            Thanks for getting in touch
          </h1>
          <p className="text-gray-600 leading-relaxed">
            Your message is with us. A human will reply as soon as possible.
          </p>
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout>
      <div className="mb-9">
        {!isNativeApp && (
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-blue-600 mb-3">
            Get in touch
          </p>
        )}
        <h1 className="text-4xl font-extrabold tracking-tight text-gray-950 mb-3">
          Contact SHÜÜT
        </h1>
        <p className="text-[15px] text-gray-600">
          Questions, press, partnerships, or feedback — drop us a note and a human will reply.
        </p>
      </div>

      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-gray-200 bg-white p-6 md:p-8 space-y-6 shadow-sm"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className="text-sm font-medium text-gray-800">
            First name
            <Input
              required
              maxLength={80}
              autoComplete="given-name"
              value={firstName}
              onChange={(event) => setFirstName(event.target.value)}
              className="mt-2 h-11 bg-white"
            />
          </label>
          <label className="text-sm font-medium text-gray-800">
            Last name
            <Input
              required
              maxLength={80}
              autoComplete="family-name"
              value={lastName}
              onChange={(event) => setLastName(event.target.value)}
              className="mt-2 h-11 bg-white"
            />
          </label>
        </div>

        <label className="block text-sm font-medium text-gray-800">
          Email address
          <Input
            required
            type="email"
            maxLength={254}
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 h-11 bg-white"
          />
        </label>

        <label className="block text-sm font-medium text-gray-800">
          Message
          <textarea
            required
            maxLength={MAX_MESSAGE_LENGTH}
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            className="mt-2 min-h-36 w-full resize-y rounded-md border border-input bg-white px-3 py-3 text-sm shadow-sm outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring"
          />
          <span className="mt-1 block text-xs font-normal text-gray-500">
            {MAX_MESSAGE_LENGTH - message.length} characters remaining
          </span>
        </label>

        <label className="hidden" aria-hidden="true">
          Website
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(event) => setWebsite(event.target.value)}
          />
        </label>

        <label className="flex items-start gap-3 text-sm leading-relaxed text-gray-700">
          <input
            required
            type="checkbox"
            checked={consent}
            onChange={(event) => setConsent(event.target.checked)}
            className="mt-1 h-4 w-4 rounded border-gray-300 accent-gray-950"
          />
          <span>
            I understand my email address will only be used to reply to this message — never
            for marketing or any other communication.
          </span>
        </label>

        {sendMessage.isError && (
          <p role="alert" className="text-sm font-medium text-red-700">
            Your message could not be sent. Please try again.
          </p>
        )}

        <div className="flex justify-end pt-1">
          <Button
            type="submit"
            disabled={sendMessage.isPending || !consent}
            className="min-w-36 bg-gray-950 text-white hover:bg-gray-800"
          >
            {sendMessage.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Send message
          </Button>
        </div>
      </form>
    </PublicLayout>
  );
}
export default function Waitlist() {
  const basePath = import.meta.env.BASE_URL.replace(/\/$/, "");
  return (
    <main className="min-h-[100dvh] bg-white px-6 text-foreground grid place-items-center">
      <section className="w-full max-w-[420px] text-center">
        <img src={`${basePath}/shuut-logo.png`} alt="SHÜÜT" className="mx-auto h-[100px] w-auto" />
        <h1 className="mt-8 text-3xl font-extrabold tracking-tight">Thanks for your interest</h1>
        <p className="mt-4 text-[17px] font-medium leading-7 text-muted-foreground">
          You’re on the waitlist for general availability. We’ll be in touch when SHÜÜT opens to founders everywhere.
        </p>
      </section>
    </main>
  );
}
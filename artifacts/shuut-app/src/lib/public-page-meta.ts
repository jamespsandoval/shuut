import { useEffect } from "react";

export const siteUrl = "https://shuut.me";
export const homeMetadata = {
  title: "SHÜÜT",
  description: "Share voice notes. Hear what people are thinking, in their own words.",
  url: `${siteUrl}/`,
};

export const publicPages = {
  home: homeMetadata,
  about: {
    title: "About SHÜÜT | A voice-note-first social platform",
    description: "SHÜÜT is a voice-note-first social platform for sharing short recordings with readable transcripts. Hear people's voices, read their words, and join the conversation.",
    url: `${siteUrl}/about`,
  },
  community: {
    title: "Community Guidelines | SHÜÜT",
    description: "Read SHÜÜT's Community Guidelines: our principles, prohibited content, how to report harm, moderation, and appeals.",
    url: `${siteUrl}/community`,
  },
  terms: {
    title: "Terms of Service | SHÜÜT",
    description: "Read the SHÜÜT Terms of Service, including account eligibility, content rules, moderation, transcription, and account deletion.",
    url: `${siteUrl}/terms`,
  },
  privacy: {
    title: "Privacy Policy | SHÜÜT",
    description: "Learn how SHÜÜT handles account data, voice recordings, transcripts, AI processing, analytics, retention, and your privacy rights.",
    url: `${siteUrl}/privacy`,
  },
  cookies: {
    title: "Cookie Policy | SHÜÜT",
    description: "Learn how SHÜÜT uses essential cookies, local storage, and cookieless product analytics, and how to manage browser settings.",
    url: `${siteUrl}/cookies`,
  },
  contact: {
    title: "Contact SHÜÜT | Questions and feedback",
    description: "Contact SHÜÜT with questions, press and partnership enquiries, feedback, or help with the voice-first social platform.",
    url: `${siteUrl}/contact`,
  },
} as const;

export type PublicPage = keyof typeof publicPages;

export function publicPageSchema(page: PublicPage) {
  const { title, description, url } = publicPages[page];
  const website = { "@type": "WebSite", name: "SHÜÜT", url: siteUrl };
  const publisher = { "@type": "Organization", name: "DoublePortrait Labs", url: "https://doubleportrait.com/labs" };
  return page === "home"
    ? { "@context": "https://schema.org", ...website, publisher }
    : {
        "@context": "https://schema.org",
        "@type": page === "about" ? "AboutPage" : page === "contact" ? "ContactPage" : "WebPage",
        name: title,
        description,
        url,
        isPartOf: website,
        publisher,
      };
}

/** Keep metadata correct when navigating between static entries and SPA routes. */
export function usePublicPageMetadata(page: PublicPage) {
  useEffect(() => {
    const metadata = publicPages[page];
    const directEntry = document.documentElement.hasAttribute("data-public-entry")
      || document.documentElement.hasAttribute("data-about-entry");
    const previousTitle = directEntry ? homeMetadata.title : document.title;
    document.title = metadata.title;

    const updates = [
      ['meta[name="description"]', metadata.description, homeMetadata.description],
      ['meta[property="og:title"]', metadata.title, homeMetadata.title],
      ['meta[property="og:description"]', metadata.description, homeMetadata.description],
      ['meta[property="og:url"]', metadata.url, homeMetadata.url],
      ['meta[name="twitter:title"]', metadata.title, homeMetadata.title],
      ['meta[name="twitter:description"]', metadata.description, homeMetadata.description],
      ['link[rel="canonical"]', metadata.url, homeMetadata.url],
    ] as const;
    const previous = updates.map(([selector, value, homeValue]) => {
      const element = document.querySelector(selector);
      const attribute = element?.tagName === "LINK" ? "href" : "content";
      const original = directEntry ? homeValue : element?.getAttribute(attribute);
      element?.setAttribute(attribute, value);
      return { element, attribute, original };
    });
    let schema = document.querySelector<HTMLScriptElement>('script[data-public-page-schema]');
    if (!schema) {
      schema = document.createElement("script");
      schema.type = "application/ld+json";
      schema.dataset.publicPageSchema = "";
      document.head.appendChild(schema);
    }
    schema.textContent = JSON.stringify(publicPageSchema(page)).replaceAll("<", "\\u003c");

    return () => {
      document.title = previousTitle;
      schema?.remove();
      for (const { element, attribute, original } of previous) {
        if (original == null) element?.removeAttribute(attribute);
        else element?.setAttribute(attribute, original);
      }
    };
  }, [page]);
}
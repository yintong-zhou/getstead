import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BrandMark } from "@/components/brand-mark";
import { landingCopy } from "@/components/landing/copy";
import { privacyCopy } from "@/components/landing/privacy-copy";
import { isLocale } from "@/server/locale";
import { landingAlternates } from "@/server/seo";
import "@/components/landing/landing.css";

// Static like the home page: nothing here depends on the request.
type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = privacyCopy[locale];
  return { title: `${copy.metaTitle} | getstead`, description: copy.metaDescription, alternates: landingAlternates(locale, "/privacy") };
}

export default async function Privacy({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  const copy = privacyCopy[locale];
  const other = locale === "en" ? "it" : "en";
  const contact = process.env.PRIVACY_CONTACT_EMAIL;

  return (
    <div className="landing">
      <a className="skip-link" href="#main">{landingCopy[locale].skip}</a>
      <header className="landing-nav">
        <div className="landing-wrap landing-nav-row">
          <Link className="wordmark" href={`/${locale}`} aria-label={landingCopy[locale].nav.home}><BrandMark /><span>getstead</span></Link>
          <Link className="language-link" href={`/${other}/privacy`} lang={other} hrefLang={other}>{landingCopy[locale].nav.language}</Link>
        </div>
      </header>
      <main id="main" tabIndex={-1} className="landing-section">
        <div className="landing-wrap landing-narrow landing-prose">
          <h1>{copy.title}</h1>
          <p className="landing-note">{copy.updated}</p>
          {copy.sections.map(({ title, body }) => (
            <section key={title}>
              <h2>{title}</h2>
              <p>{body}</p>
            </section>
          ))}
          {contact && <p>{copy.contact} <a href={`mailto:${contact}`}>{contact}</a>.</p>}
          <p><Link href={`/${locale}`}>{copy.back}</Link></p>
        </div>
      </main>
    </div>
  );
}

import Link from "next/link";
import type { ReactNode } from "react";
import type { Locale } from "@/server/locale";
import { BrandMark } from "../brand-mark";
import { Icon } from "../icon";
import { landingCopy } from "./copy";
import { BudgetMock, InvestmentsMock, NetWorthMock, OverviewMock, PropertyMock } from "./mocks";
import { WaitlistForm } from "./waitlist-form";
import "./landing.css";

type Props = { locale: Locale; jsonLd: string };

/** One section: its text on the left split line, its picture or content on the right. */
function Feature({ id, title, body, children, extra }: {
  id: string; title: string; body?: string; children: ReactNode; extra?: ReactNode;
}) {
  return (
    <section id={id} className="landing-section" aria-labelledby={`${id}-title`}>
      <div className="landing-wrap landing-split">
        <div className="landing-text">
          <h2 id={`${id}-title`}>{title}</h2>
          {body && <p className="landing-lead">{body}</p>}
          {extra}
        </div>
        <div className="landing-visual">{children}</div>
      </div>
    </section>
  );
}

/** The public home. Static: it reads no cookies or headers, so it is prerendered per language. */
export function Landing({ locale, jsonLd }: Props) {
  const copy = landingCopy[locale];
  const other: Locale = locale === "en" ? "it" : "en";

  return (
    <>
      <a className="skip-link" href="#main">{copy.skip}</a>

      <header className="landing-nav">
        <div className="landing-wrap landing-nav-row">
          <Link className="wordmark" href={`/${locale}`} aria-label={copy.nav.home}><BrandMark /><span>getstead</span></Link>
          <nav aria-label={copy.nav.label} className="landing-nav-links">
            <Link className="landing-link" href={`/${other}`} lang={other} hrefLang={other}>{copy.nav.language}</Link>
            <Link className="landing-link" href={`/${locale}/login`}>{copy.nav.signIn}</Link>
            <a className="landing-button landing-button-small" href="#waitlist">{copy.nav.waitlist}</a>
          </nav>
        </div>
      </header>

      <main id="main" tabIndex={-1} className="landing">
        <section className="landing-hero" aria-labelledby="hero-title">
          <div className="landing-wrap landing-hero-grid">
            <div className="landing-text" data-enter>
              <h1 id="hero-title">{copy.hero.title}</h1>
              <p className="landing-lead">{copy.hero.lead}</p>
              <div className="landing-actions">
                <a className="landing-button" href="#waitlist">{copy.nav.waitlist}</a>
                <Link className="landing-button landing-button-quiet" href={`/${locale}/login`}>{copy.nav.signIn}</Link>
              </div>
              <p className="landing-fact"><Icon name="check" size={16} />{copy.hero.fact}</p>
            </div>
            <div className="landing-visual" data-enter role="img" aria-label={copy.hero.preview}>
              <OverviewMock locale={locale} />
            </div>
          </div>
        </section>

        <Feature
          id="cash-flow"
          title={copy.cashFlow.title}
          body={copy.cashFlow.body}
          extra={<ul className="landing-points">{copy.cashFlow.points.map((point) => <li key={point}>{point}</li>)}</ul>}
        >
          <BudgetMock locale={locale} />
        </Feature>

        <Feature id="net-worth" title={copy.netWorth.title} body={copy.netWorth.body}>
          <NetWorthMock locale={locale} />
        </Feature>

        <Feature
          id="investments"
          title={copy.investments.title}
          body={copy.investments.body}
          extra={<p className="landing-note">{copy.investments.note}</p>}
        >
          <InvestmentsMock locale={locale} />
        </Feature>

        <Feature id="property" title={copy.property.title} body={copy.property.body}>
          <PropertyMock locale={locale} />
        </Feature>

        <section id="how" className="landing-section" aria-labelledby="how-title">
          <div className="landing-wrap">
            <h2 id="how-title">{copy.how.title}</h2>
            <ol className="landing-steps">
              {copy.how.steps.map(({ title, body }, index) => (
                <li key={title}>
                  <span className="landing-step-number" aria-hidden="true">{index + 1}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <Feature id="data" title={copy.data.title}>
          <ul className="landing-facts">
            {copy.data.points.map((point) => (
              <li key={point}>
                <span className="row-icon tone-green" aria-hidden="true"><Icon name="check" size={20} /></span>
                <p>{point}</p>
              </li>
            ))}
          </ul>
        </Feature>

        <Feature id="faq" title={copy.faq.title}>
          <div className="landing-faq">
            {copy.faq.items.map(({ q, a }) => (
              <details key={q}>
                <summary>{q}<Icon name="chevron" size={18} /></summary>
                <p>{a}</p>
              </details>
            ))}
          </div>
        </Feature>

        <Feature id="waitlist" title={copy.waitlist.title} body={copy.waitlist.body}>
          <div className="landing-card">
            <WaitlistForm locale={locale} />
          </div>
        </Feature>
      </main>

      <footer className="landing-footer">
        <div className="landing-wrap landing-footer-row">
          <div className="wordmark"><BrandMark priority={false} /><span>getstead</span></div>
          <nav aria-label={copy.footer.navigation} className="landing-nav-links">
            <Link className="landing-link" href={`/${locale}/login`}>{copy.nav.signIn}</Link>
            <Link className="landing-link" href={`/${locale}/privacy`}>{copy.footer.privacy}</Link>
            <Link className="landing-link" href={`/${other}`} lang={other} hrefLang={other}>{copy.nav.language}</Link>
          </nav>
        </div>
        <p className="landing-wrap landing-footnote">{copy.footer.note}</p>
      </footer>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />
    </>
  );
}

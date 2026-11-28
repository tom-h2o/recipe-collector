import { ArrowLeft, ArrowRight, ExternalLink } from 'lucide-react';
import { SpeisekammerLogo } from '@/components/SpeisekammerLogo';
import {
  APP_NAME, APP_TAGLINE, AUTHOR_NAME, AUTHOR_URL, PITCH, CAPABILITY_GROUPS, DATA_NOTE, capabilityText,
} from '@/lib/appInfo';
import { useT } from '@/i18n';
import { rich } from '@/i18n/rich';
import { isSignupOpen } from '@/lib/signupOpen';

interface Props {
  /** Where "create an account" goes. The app root shows the sign-in screen. */
  signUpHref?: string;
}

/**
 * The /about page. Rendered before AuthGate, so it has to stand on its own for
 * someone with no account — it makes no queries and reads no session.
 */
export function AboutPage({ signUpHref = '/' }: Props) {
  const t = useT();
  const signupOpen = isSignupOpen();
  return (
    <div className="min-h-screen bg-sk-surface dark:bg-zinc-950 text-sk-on-surface dark:text-foreground font-sans">
      {/* The way back. Opened from the Home Screen the app has no browser
          around it, so no Back button either: without this the page could
          only be left by closing the app. Stays in view while reading, clear
          of the status bar. */}
      <nav aria-label={t('Back')} className="sticky top-0 z-10 glass-bar pt-[var(--safe-top)] pl-[var(--safe-left)] pr-[var(--safe-right)]">
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center">
          <a
            href={signUpHref}
            className="inline-flex items-center gap-2 h-10 pl-2.5 pr-4 rounded-full text-sm font-semibold text-sk-primary dark:text-primary hover:bg-sk-primary-fixed/40 dark:hover:bg-primary/15 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" aria-hidden="true" /> {t('Back')}
          </a>
        </div>
      </nav>
      <div className="max-w-4xl mx-auto px-6 pt-10 pb-[calc(4rem+var(--safe-bottom))] sm:pt-16 sm:pb-24 space-y-20">

        {/* ── Masthead ─────────────────────────────────────────────────── */}
        <header className="text-center space-y-4">
          <div className="flex items-center justify-center gap-3">
            <SpeisekammerLogo size={48} />
            <h1 className="font-serif text-4xl sm:text-5xl font-normal text-sk-primary dark:text-primary tracking-tight">
              {APP_NAME}
            </h1>
          </div>
          <p className="text-xs uppercase tracking-[0.15em] text-sk-on-surface-variant dark:text-muted-foreground">
            {t(APP_TAGLINE)}
          </p>
        </header>

        {/* ── The problem, then the answer ─────────────────────────────── */}
        <section className="space-y-6 max-w-2xl mx-auto">
          <h2 className="font-serif text-2xl sm:text-3xl font-normal">{t('Why it exists')}</h2>
          <p className="text-lg leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
            {t(PITCH.problem)}
          </p>
          <p className="text-lg leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
            {t(PITCH.solution)}
          </p>
          <p className="text-lg leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
            {t(PITCH.story)}
          </p>
        </section>

        {/* ── What it does ─────────────────────────────────────────────── */}
        <section className="space-y-12">
          <h2 className="font-serif text-2xl sm:text-3xl font-normal text-center">{t('What it does')}</h2>
          {CAPABILITY_GROUPS.map((group) => (
            <div key={group.heading} className="space-y-5">
              <h3 className="text-xs uppercase tracking-[0.15em] text-sk-primary dark:text-primary font-semibold border-b border-sk-outline-variant dark:border-border pb-2">
                {t(group.heading)}
              </h3>
              <ul className="grid sm:grid-cols-2 gap-x-8 gap-y-6">
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const { title, blurb } = capabilityText(item, t);
                  return (
                    <li key={item.title} className="flex gap-4">
                      <span className="shrink-0 w-10 h-10 rounded-full bg-sk-primary-fixed/50 dark:bg-primary/15 flex items-center justify-center">
                        <Icon className="w-5 h-5 text-sk-primary dark:text-primary" />
                      </span>
                      <div className="space-y-1">
                        <h4 className="font-semibold leading-snug">{title}</h4>
                        <p className="text-sm leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
                          {blurb}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </section>

        {/* ── What happens to your data ────────────────────────────────── */}
        <section id="your-data" className="space-y-6 max-w-2xl mx-auto scroll-mt-8">
          <h2 className="font-serif text-2xl sm:text-3xl font-normal">{t('What happens to your data')}</h2>
          <dl className="space-y-5">
            {DATA_NOTE.map((item) => (
              <div key={item.title} className="space-y-1">
                <dt className="font-semibold">{t(item.title)}</dt>
                <dd className="text-sm leading-relaxed text-sk-on-surface-variant dark:text-muted-foreground">
                  {t(item.text)}
                </dd>
              </div>
            ))}
          </dl>
        </section>

        {/* ── Call to action ───────────────────────────────────────────── */}
        <section className="text-center space-y-6 bg-sk-surface-low dark:bg-card rounded-3xl p-10 sm:p-14">
          {signupOpen ? (
            <>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal">{t('Start your own vault')}</h2>
              <p className="text-sk-on-surface-variant dark:text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {t('Making an account takes a moment, and the first recipe takes about as long as pasting a link.')}
              </p>
              <a
                href={signUpHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold transition-colors"
              >
                {t('Create a free account')} <ArrowRight className="w-4 h-4" />
              </a>
            </>
          ) : (
            <>
              <h2 className="font-serif text-2xl sm:text-3xl font-normal">{t('By invitation, for now')}</h2>
              <p className="text-sk-on-surface-variant dark:text-muted-foreground max-w-xl mx-auto leading-relaxed">
                {t('{app} is being tried out by family and friends. If you were invited, sign in with the address the invitation went to.', { app: APP_NAME })}
              </p>
              <a
                href={signUpHref}
                className="inline-flex items-center gap-2 px-7 py-3.5 rounded-full bg-sk-primary hover:bg-sk-primary-container dark:bg-primary dark:hover:bg-primary/90 text-white dark:text-primary-foreground font-semibold transition-colors"
              >
                {t('Sign in')} <ArrowRight className="w-4 h-4" />
              </a>
            </>
          )}
        </section>

        {/* ── Who made it ──────────────────────────────────────────────── */}
        <footer className="text-center space-y-3 pt-4 border-t border-sk-outline-variant dark:border-border">
          <p className="text-sm text-sk-on-surface-variant dark:text-muted-foreground pt-8">
            {rich(t, '{app} is designed and built by <author>{name}</author>.', {
              author: (name) => <span className="font-semibold text-sk-on-surface dark:text-foreground">{name}</span>,
            }, { app: APP_NAME, name: AUTHOR_NAME })}
          </p>
          <a
            href={AUTHOR_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm font-medium text-sk-primary dark:text-primary hover:underline"
          >
            <ExternalLink className="w-4 h-4" /> github.com/tom-h2o
          </a>
        </footer>
      </div>
    </div>
  );
}

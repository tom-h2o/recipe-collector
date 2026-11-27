import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AboutPage } from './AboutPage';
import { APP_NAME, AUTHOR_NAME, AUTHOR_URL, CAPABILITY_GROUPS, DATA_NOTE, PITCH } from '@/lib/appInfo';

afterEach(() => vi.unstubAllEnvs());

describe('AboutPage', () => {
  it('names the app and says why it exists', () => {
    render(<AboutPage />);
    expect(screen.getAllByText(APP_NAME).length).toBeGreaterThan(0);
    expect(screen.getByText(PITCH.problem)).toBeInTheDocument();
  });

  it('lists every capability group and item', () => {
    render(<AboutPage />);
    for (const group of CAPABILITY_GROUPS) {
      expect(screen.getByText(group.heading)).toBeInTheDocument();
      for (const item of group.items) {
        expect(screen.getByText(item.title)).toBeInTheDocument();
      }
    }
  });

  it('credits its author, with a link', () => {
    // The author credit is the one piece of this page that exists because the
    // owner asked for it by name; a redesign must not quietly drop it.
    render(<AboutPage />);
    expect(screen.getByText(AUTHOR_NAME)).toBeInTheDocument();
    const link = screen.getByRole('link', { name: /github\.com\/tom-h2o/i });
    expect(link).toHaveAttribute('href', AUTHOR_URL);
    expect(link).toHaveAttribute('rel', expect.stringContaining('noopener'));
  });

  it('sends a convinced reader somewhere they can sign up, when sign-up is open', () => {
    vi.stubEnv('VITE_SIGNUP_OPEN', 'true');
    render(<AboutPage />);
    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/');
  });

  it('invites nobody while accounts are by invitation', () => {
    // The default: no variable set. A stranger reading the page must not be
    // told to make an account that Supabase would then refuse.
    render(<AboutPage />);
    expect(screen.queryByText(/create a free account/i)).toBeNull();
    expect(screen.getByRole('heading', { name: /by invitation/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/');
  });

  it('says what happens to a person’s data, naming who receives it', () => {
    render(<AboutPage />);
    const section = document.getElementById('your-data');
    expect(section).not.toBeNull();
    for (const item of DATA_NOTE) expect(section!.textContent).toContain(item.title);
    // The services recipes are sent to, and the way out.
    for (const name of ['Anthropic', 'Google', 'Supabase', 'Vercel', 'Unsplash', 'Sentry', 'Delete account']) {
      expect(section!.textContent).toContain(name);
    }
  });

  it('does not leak the author’s email address', () => {
    // The owner's address is private; the page is public by definition.
    render(<AboutPage />);
    expect(document.body.textContent).not.toMatch(/@(icloud|gmail|me)\.com/i);
    expect(document.body.innerHTML).not.toMatch(/mailto:/i);
  });
});

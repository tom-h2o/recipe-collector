import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AboutPage } from './AboutPage';
import { APP_NAME, AUTHOR_NAME, AUTHOR_URL, CAPABILITY_GROUPS, PITCH } from '@/lib/appInfo';

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

  it('sends a convinced reader somewhere they can sign up', () => {
    render(<AboutPage />);
    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/');
  });

  it('does not leak the author’s email address', () => {
    // The owner's address is private; the page is public by definition.
    render(<AboutPage />);
    expect(document.body.textContent).not.toMatch(/@(icloud|gmail|me)\.com/i);
    expect(document.body.innerHTML).not.toMatch(/mailto:/i);
  });
});

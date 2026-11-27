import { afterEach, describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import { PublicRecipe } from './PublicRecipe';
import type { Recipe } from '@/types';

/**
 * The share page is the one screen rendered for someone with no account, so
 * these tests stand in for "a stranger opened the link": what they can see,
 * what they can change, and what must never reach them.
 */
const recipe: Recipe = {
  id: 'r1',
  title: 'Lentil Soup',
  description: 'Warming and cheap',
  ingredients: [
    { amount: '200g', name: 'lentils', details: 'rinsed' },
    { amount: '2', name: 'carrots', details: '' },
  ],
  instructions: 'Chop the carrots.\nSimmer for 25 minutes.',
  image_url: '',
  servings: 4,
  created_at: '2026-01-01T00:00:00Z',
  tags: ['soup'],
  is_favourite: false,
  nutrition: null,
  rating: null,
  notes: null,
  prep_time_mins: 10,
  cook_time_mins: 25,
  source_url: null,
  source_name: null,
};

afterEach(() => vi.unstubAllEnvs());

describe('PublicRecipe', () => {
  it('shows the recipe a guest followed the link for', () => {
    render(<PublicRecipe recipe={recipe} />);
    expect(screen.getByText('Lentil Soup')).toBeInTheDocument();
    expect(screen.getByText('lentils')).toBeInTheDocument();
    expect(screen.getByText('Chop the carrots.')).toBeInTheDocument();
    expect(screen.getByText('Simmer for 25 minutes.')).toBeInTheDocument();
    expect(screen.getByText('Serves 4')).toBeInTheDocument();
  });

  it('scales the ingredients when a guest changes the servings', () => {
    render(<PublicRecipe recipe={recipe} />);
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByLabelText('More servings'));
    expect(screen.getByText('Serves 6')).toBeInTheDocument();
    // 4 -> 6 is x1.5
    expect(screen.getByText('300g')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('will not scale below one serving', () => {
    render(<PublicRecipe recipe={recipe} />);
    const fewer = screen.getByLabelText('Fewer servings');
    for (let i = 0; i < 6; i++) fireEvent.click(fewer);
    expect(screen.getByText('Serves 1')).toBeInTheDocument();
    expect(fewer).toBeDisabled();
  });

  it('offers a way back to the original servings', () => {
    render(<PublicRecipe recipe={recipe} />);
    expect(screen.queryByText(/Reset to/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByText('Reset to 4'));
    expect(screen.getByText('Serves 4')).toBeInTheDocument();
    expect(screen.getByText('200g')).toBeInTheDocument();
  });

  it('scales from original_servings, so a recipe saved scaled still reads right', () => {
    render(<PublicRecipe recipe={{ ...recipe, servings: 8, original_servings: 4 }} />);
    // Base is 4, so the stepper opens at 4 and the amounts are the stored ones.
    expect(screen.getByText('Serves 4')).toBeInTheDocument();
    expect(screen.getByText('200g')).toBeInTheDocument();
  });

  it('lets a guest into cook mode without an account', () => {
    render(<PublicRecipe recipe={recipe} />);
    fireEvent.click(screen.getByRole('button', { name: /cook/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('Chop the carrots.')).toBeInTheDocument();
  });

  it('carries the guest’s scaling into cook mode', () => {
    render(<PublicRecipe recipe={recipe} />);
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByRole('button', { name: /cook/i }));
    const dialog = screen.getByRole('dialog');
    // Cook mode keeps its ingredient list behind a toggle.
    fireEvent.click(within(dialog).getByLabelText('Show ingredients'));
    // Scaled amounts, not the stored ones: stepping into cook mode must not
    // silently revert the cook's own maths.
    expect(within(dialog).getByText(/300g/)).toBeInTheDocument();
  });

  it('never renders the owner’s private fields, even if they reach the component', () => {
    // The RPC does not return these columns at all (migration 0061). This is
    // the second line of defence: if a future change widens that column list,
    // the page still must not print someone's private notes to the world.
    render(
      <PublicRecipe
        recipe={{ ...recipe, notes: 'SECRET NOTE', rating: 5, user_id: 'owner-uuid' } as Recipe}
      />
    );
    expect(screen.queryByText(/SECRET NOTE/)).not.toBeInTheDocument();
    expect(screen.queryByText(/owner-uuid/)).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('SECRET NOTE');
  });
});

describe('PublicRecipe: the pitch to a guest', () => {
  it('explains what the app is and credits its author', () => {
    render(<PublicRecipe recipe={recipe} />);
    expect(screen.getByText(/Someone sent you this from their recipe vault/i)).toBeInTheDocument();
    expect(screen.getByText('Thomas Holder')).toBeInTheDocument();
  });

  it('offers a way to sign up and a way to read more', () => {
    vi.stubEnv('VITE_SIGNUP_OPEN', 'true');
    render(<PublicRecipe recipe={recipe} />);
    expect(screen.getByRole('link', { name: /create a free account/i })).toHaveAttribute('href', '/');
    expect(screen.getByRole('link', { name: /see everything it does/i })).toHaveAttribute('href', '/about');
  });

  it('keeps the pitch off the printed page', () => {
    // Printing a shared recipe should produce a recipe, not an advert.
    const { container } = render(<PublicRecipe recipe={recipe} />);
    const aside = container.querySelector('aside');
    expect(aside).not.toBeNull();
    expect(aside!.className).toContain('print:hidden');
    expect(aside!.textContent).toMatch(/See everything it does/i);
  });

  it('does not ask a stranger to sign up while accounts are by invitation', () => {
    render(<PublicRecipe recipe={recipe} />);
    expect(screen.queryByText(/create a free account/i)).toBeNull();
    expect(document.body.textContent).not.toMatch(/You can have one too/);
    expect(screen.getByRole('link', { name: /see everything it does/i })).toHaveAttribute('href', '/about');
  });

  it('does not leak the author’s email address', () => {
    render(<PublicRecipe recipe={recipe} />);
    expect(document.body.textContent).not.toMatch(/@(icloud|gmail|me)\.com/i);
  });
});

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import type { Recipe } from '@/types';

const rpc = vi.fn();
vi.mock('@/lib/supabase', () => ({ supabase: { rpc: (...args: unknown[]) => rpc(...args) } }));

const { PublicRecipe } = await import('./PublicRecipe');

const recipe: Recipe = {
  id: 'r1',
  title: 'Lentil Soup',
  description: 'Warming',
  ingredients: [
    { amount: '200g', name: 'lentils', details: 'rinsed' },
    { amount: '1', name: 'oven', details: 'preheated to 200°C' },
  ],
  instructions: 'Heat the oven to 180°C.\nSimmer for 25 minutes.',
  image_url: 'https://img/hero.jpg',
  servings: 4,
  created_at: '2026-01-01T00:00:00Z',
  tags: [],
  is_favourite: false,
  nutrition: { calories: 320, protein_g: 18, carbs_g: 44, fat_g: 6, fiber_g: 9 },
  rating: null,
  notes: null,
  prep_time_mins: 10,
  cook_time_mins: 25,
  source_url: null,
  source_name: null,
};

function mockRpc({ images = [], translations = [] }: { images?: unknown[]; translations?: unknown[] } = {}) {
  rpc.mockImplementation((fn: string) => {
    if (fn === 'get_shared_recipe_images') return Promise.resolve({ data: images, error: null });
    if (fn === 'get_shared_recipe_translations') return Promise.resolve({ data: translations, error: null });
    return Promise.resolve({ data: [], error: null });
  });
}

beforeEach(() => { rpc.mockReset(); mockRpc(); });

describe('the guest page: nutrition', () => {
  it('shows the nutrition the RPC already returns', () => {
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    expect(screen.getByText('Calories')).toBeInTheDocument();
    expect(screen.getByText(/320/)).toBeInTheDocument();
  });

  it('does not scale per-serving figures when the servings change', () => {
    // A per-serving figure is the same however many servings you cook.
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByLabelText('More servings'));
    expect(screen.getByText('Serves 6')).toBeInTheDocument();
    expect(screen.getByText(/320/)).toBeInTheDocument();
  });
});

describe('the guest page: temperatures', () => {
  it('converts temperatures in steps and ingredient details on request', () => {
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    expect(screen.getByText(/Heat the oven to 180°C/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText(/Show temperatures in Fahrenheit/i));

    // 180C is 356F, 200C is 392F.
    expect(screen.queryByText(/180°C/)).not.toBeInTheDocument();
    expect(screen.getByText(/356°F/)).toBeInTheDocument();
    // The ingredient detail is converted too, not just the instructions.
    expect(screen.queryByText(/200°C/)).not.toBeInTheDocument();
    expect(screen.getByText(/392°F/)).toBeInTheDocument();
  });
});

describe('the guest page: gallery', () => {
  it('falls back to the single hero image when there is no gallery', () => {
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    expect(screen.getByRole('img', { name: 'Lentil Soup' })).toHaveAttribute('src', 'https://img/hero.jpg');
    expect(screen.queryByLabelText(/Show photo 2/)).not.toBeInTheDocument();
  });

  it('shows every photo of the recipe, and lets the guest switch between them', async () => {
    mockRpc({ images: [
      { url: 'https://img/one.jpg', source: 'upload', sort_order: 1 },
      { url: 'https://img/two.jpg', source: 'website', sort_order: 2 },
    ] });
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);

    await waitFor(() => expect(screen.getByLabelText('Show photo 2')).toBeInTheDocument());
    expect(screen.getByRole('img', { name: 'Lentil Soup' })).toHaveAttribute('src', 'https://img/one.jpg');

    fireEvent.click(screen.getByLabelText('Show photo 2'));
    expect(screen.getByRole('img', { name: 'Lentil Soup' })).toHaveAttribute('src', 'https://img/two.jpg');
  });

  it('asks for nothing at all when there is no share token', () => {
    // The legacy /recipe/:id route has no token; it must not call the RPCs.
    render(<PublicRecipe recipe={recipe} shareToken={null} />);
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe('the guest page: cached translations', () => {
  const german = {
    language_code: 'de',
    title: 'Linsensuppe',
    description: 'Wärmend',
    instructions: 'Ofen auf 180°C erhitzen.\n25 Minuten köcheln.',
    ingredients: [{ amount: '200g', name: 'Linsen', details: 'gespült' }],
  };

  it('offers only the languages the owner already had translated', async () => {
    mockRpc({ translations: [german] });
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);

    await waitFor(() => expect(screen.getByRole('button', { name: /Deutsch/ })).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: /Français/ })).not.toBeInTheDocument();
  });

  it('offers nothing when the owner has no cached translations', () => {
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    expect(screen.queryByRole('button', { name: /Original/ })).not.toBeInTheDocument();
  });

  it('switches the whole recipe, and back again', async () => {
    mockRpc({ translations: [german] });
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Deutsch/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Deutsch/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Linsensuppe');
    expect(screen.getByText('Linsen')).toBeInTheDocument();
    expect(screen.getByText(/köcheln/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Original/ }));
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('Lentil Soup');
  });

  it('keeps the guest’s scaling when they switch language', async () => {
    mockRpc({ translations: [german] });
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Deutsch/ })).toBeInTheDocument());

    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByLabelText('More servings'));
    fireEvent.click(screen.getByRole('button', { name: /Deutsch/ }));

    expect(screen.getByText('Serves 6')).toBeInTheDocument();
    expect(screen.getByText('300g')).toBeInTheDocument();
  });

  it('carries the translation into cook mode', async () => {
    mockRpc({ translations: [german] });
    render(<PublicRecipe recipe={recipe} shareToken="tok" />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Deutsch/ })).toBeInTheDocument());

    fireEvent.click(screen.getByRole('button', { name: /Deutsch/ }));
    fireEvent.click(screen.getByRole('button', { name: /^Cook$/i }));
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText(/Ofen auf/)).toBeInTheDocument();
  });
});

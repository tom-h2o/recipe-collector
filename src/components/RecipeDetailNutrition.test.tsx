import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, within } from '@testing-library/react';
import type { Recipe } from '@/types';

// RecipeDetail reaches for Supabase through two hooks and the API helper.
// None of that is what this file is about, so they are stubbed flat.
vi.mock('@/lib/supabase', () => ({ supabase: { from: () => ({}), rpc: () => Promise.resolve({ data: [], error: null }) } }));
vi.mock('@/lib/api', () => ({ apiFetch: vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({}) })) }));
vi.mock('@/hooks/useRecipeImages', () => ({
  useRecipeImages: () => ({ images: [], loading: false, busy: false, fetchImages: vi.fn(), addImages: vi.fn(), deleteImage: vi.fn(), setImages: vi.fn() }),
}));
vi.mock('@/hooks/useRecipeRatings', () => ({
  useRecipeRatings: () => ({ ratings: [], myRating: null, otherRatings: [], busy: false, fetchRatings: vi.fn(), setRating: vi.fn() }),
}));

const { RecipeDetail } = await import('./RecipeDetail');

const recipe: Recipe = {
  id: 'r1',
  title: 'Lentil Soup',
  description: 'Warming',
  ingredients: [{ amount: '200g', name: 'lentils', details: '' }],
  instructions: 'Simmer for 25 minutes.',
  image_url: '',
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
  user_id: 'me',
};

function renderDetail() {
  return render(
    <RecipeDetail
      recipe={recipe}
      preferredLanguage={null}
      onLanguageChange={vi.fn()}
      onTranslationCached={vi.fn()}
      onClose={vi.fn()}
      onEdit={vi.fn()}
      onDelete={vi.fn()}
      onUpdateRecipe={vi.fn(async () => true)}
      userId="me"
    />
  );
}

/**
 * Nutrition is stored per serving — NUTRITION_TEMPLATE instructs the model to
 * "divide total recipe nutrients by the number of servings". A per-serving
 * figure is the same however large the batch, so scaling the recipe must not
 * touch it. It used to be multiplied by the scale factor, under a heading that
 * still read "Per serving".
 */
describe('RecipeDetail: nutrition and scaling', () => {
  it('shows the stored per-serving figures at the original servings', () => {
    renderDetail();
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('320')).toBeInTheDocument();
    expect(within(dialog).getByText('18')).toBeInTheDocument();
  });

  it('leaves the per-serving figures alone when the recipe is scaled up', () => {
    renderDetail();
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByLabelText(/increase servings|more servings/i));
    fireEvent.click(within(dialog).getByLabelText(/increase servings|more servings/i));

    // 4 -> 6 servings. Calories per serving do not change.
    expect(within(dialog).getByText('320')).toBeInTheDocument();
    expect(within(dialog).queryByText('480')).not.toBeInTheDocument();
  });

  it('leaves them alone when the recipe is scaled down too', () => {
    renderDetail();
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByLabelText(/decrease servings|fewer servings/i));

    expect(within(dialog).getByText('320')).toBeInTheDocument();
    expect(within(dialog).queryByText('240')).not.toBeInTheDocument();
  });

  it('still scales the ingredient amounts, which are not per serving', () => {
    // The fix must not make scaling a no-op: the quantities you shop for do
    // depend on how many servings you cook.
    renderDetail();
    const dialog = screen.getByRole('dialog');

    fireEvent.click(within(dialog).getByLabelText(/increase servings|more servings/i));
    fireEvent.click(within(dialog).getByLabelText(/increase servings|more servings/i));

    expect(within(dialog).getByText(/300g/)).toBeInTheDocument();
  });

  it('does not claim the figures were scaled', () => {
    renderDetail();
    const dialog = screen.getByRole('dialog');
    fireEvent.click(within(dialog).getByLabelText(/increase servings|more servings/i));
    expect(within(dialog).queryByText(/scaled ×/)).not.toBeInTheDocument();
  });
});

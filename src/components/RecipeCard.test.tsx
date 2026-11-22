import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { RecipeCard } from './RecipeCard';
import type { Recipe } from '@/types';

const baseRecipe: Recipe = {
  id: '1',
  title: 'Test Pasta',
  description: 'A delicious pasta dish',
  ingredients: [
    { amount: '200g', name: 'pasta', details: '' },
    { amount: '2', name: 'eggs', details: '' },
  ],
  instructions: 'Cook pasta. Mix eggs.',
  image_url: '',
  servings: 4,
  created_at: '2024-01-15T10:00:00Z',
  tags: ['italian', 'quick'],
  is_favourite: false,
  nutrition: null,
  rating: null,
  notes: null,
  prep_time_mins: 10,
  cook_time_mins: 20,
  source_url: null,
  source_name: null,
};

describe('RecipeCard', () => {
  const defaults = {
    isProcessing: false,
    activeFilter: null,
    onOpen: vi.fn(),
    onToggleFavourite: vi.fn(),
    onFilterChange: vi.fn(),
  };

  it('renders the recipe title', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('Test Pasta')).toBeInTheDocument();
  });

  it('renders the description', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('A delicious pasta dish')).toBeInTheDocument();
  });

  it('shows ingredient count', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('2 Ingredients')).toBeInTheDocument();
  });

  it('shows servings', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('Serves 4')).toBeInTheDocument();
  });

  it('shows total cooking time', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('30m')).toBeInTheDocument();
  });

  it('renders tags', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.getByText('italian')).toBeInTheDocument();
    expect(screen.getByText('quick')).toBeInTheDocument();
  });

  it('calls onOpen when card is clicked', () => {
    const onOpen = vi.fn();
    render(<RecipeCard recipe={baseRecipe} {...defaults} onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Test Pasta'));
    expect(onOpen).toHaveBeenCalledWith(baseRecipe);
  });

  it('calls onToggleFavourite when star is clicked', () => {
    const onToggleFavourite = vi.fn();
    render(<RecipeCard recipe={baseRecipe} {...defaults} onToggleFavourite={onToggleFavourite} />);
    const starBtn = screen.getByTitle('Favourite');
    fireEvent.click(starBtn);
    expect(onToggleFavourite).toHaveBeenCalled();
  });

  it('shows Unfavourite title when recipe is favourite', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, is_favourite: true }} {...defaults} />);
    expect(screen.getByTitle('Unfavourite')).toBeInTheDocument();
  });

  it('calls onFilterChange when tag is clicked', () => {
    const onFilterChange = vi.fn();
    render(<RecipeCard recipe={baseRecipe} {...defaults} onFilterChange={onFilterChange} />);
    fireEvent.click(screen.getByText('italian'));
    expect(onFilterChange).toHaveBeenCalledWith('italian');
  });

  it('shows processing badge when isProcessing is true', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} isProcessing={true} />);
    expect(screen.getByText('Processing…')).toBeInTheDocument();
  });

  it('shows fallback letter when no image', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, image_url: '' }} {...defaults} />);
    expect(screen.getByText('T')).toBeInTheDocument(); // First letter of "Test Pasta"
  });

  it('shows source name when present', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, source_name: 'BBC Good Food' }} {...defaults} />);
    expect(screen.getByText('BBC Good Food')).toBeInTheDocument();
  });

  it('shows +N more when more than 5 ingredients', () => {
    const manyIngredients = Array.from({ length: 8 }, (_, i) => ({
      amount: '1', name: `ingredient${i}`, details: '',
    }));
    render(<RecipeCard recipe={{ ...baseRecipe, ingredients: manyIngredients }} {...defaults} />);
    const more = screen.getByText(/\+3 more/);
    expect(more).toBeInTheDocument();
    // In the same quiet voice as the ingredients, not a green badge like a tag.
    expect(more.className).not.toMatch(/primary/);
    expect(more.closest('p')?.textContent).toBe('ingredient0 · ingredient1 · ingredient2 · ingredient3 · ingredient4 · +3 more');
  });
});

describe('RecipeCard: the shared badge', () => {
  const defaults = {
    isProcessing: false,
    activeFilter: null,
    onOpen: vi.fn(),
    onToggleFavourite: vi.fn(),
    onFilterChange: vi.fn(),
  };

  it('marks a recipe that has a live public link', () => {
    // Otherwise the only way to find out what you have put on the internet is
    // to open every recipe's menu in turn.
    render(
      <RecipeCard
        recipe={{ ...baseRecipe, public_share_token: '77777777-7777-7777-7777-777777777777' }}
        {...defaults}
      />
    );
    expect(screen.getByText('Shared')).toBeInTheDocument();
  });

  it('says nothing for a recipe that is not shared', () => {
    render(<RecipeCard recipe={baseRecipe} {...defaults} />);
    expect(screen.queryByText('Shared')).not.toBeInTheDocument();
  });

  it('says nothing once the link has been revoked', () => {
    render(<RecipeCard recipe={{ ...baseRecipe, public_share_token: null }} {...defaults} />);
    expect(screen.queryByText('Shared')).not.toBeInTheDocument();
  });
});

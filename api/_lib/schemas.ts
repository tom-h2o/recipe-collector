import { z } from 'zod';

export const extractSchema = z.object({
  url: z.string().url('A valid URL is required'),
});

export const tagSchema = z.object({
  recipeId: z.string().uuid('recipeId must be a UUID'),
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
  ingredients: z.unknown().optional(),
  instructions: z.string().optional(),
});

export const nutritionSchema = z.object({
  recipeId: z.string().uuid('recipeId must be a UUID'),
  title: z.string().optional(),
  ingredients: z.unknown(),
  servings: z.number().optional(),
});

export const suggestSchema = z.object({
  ingredients: z.array(z.string()).min(1, 'At least one ingredient is required'),
});

export const shoppingSchema = z.object({
  ingredients: z.array(z.string()).min(1, 'At least one ingredient is required'),
});

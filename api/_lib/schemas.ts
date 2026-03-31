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

export const extractPhotoSchema = z.object({
  imageBase64: z.string().min(1, 'imageBase64 is required'),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'image/gif']),
});

export const scaleSchema = z.object({
  recipeId: z.string().uuid().optional(),
  ingredients: z.array(
    z.object({
      amount: z.string(),
      name: z.string().min(1),
      details: z.string().optional().default(''),
    }),
  ).min(1, 'At least one ingredient is required'),
  currentServings: z.number().int().positive(),
  targetServings: z.number().int().positive(),
});

export const findImageSchema = z.object({
  title: z.string().min(1, 'title is required'),
  description: z.string().optional(),
});

export const shareSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('send'),
    recipeId: z.string().uuid(),
    recipientEmail: z.string().email(),
    senderUserId: z.string().uuid(),
    senderEmail: z.string().email(),
  }),
  z.object({
    action: z.literal('accept'),
    shareId: z.string().uuid(),
    recipientUserId: z.string().uuid(),
    recipientEmail: z.string().email(),
  }),
  z.object({
    action: z.literal('reject'),
    shareId: z.string().uuid(),
    recipientEmail: z.string().email(),
  }),
]);

export const translateSchema = z.object({
  recipeId: z.string().uuid('recipeId must be a UUID'),
  targetLanguage: z.enum(['en', 'de', 'pl'], { message: 'Unsupported language' }),
  title: z.string().min(1),
  description: z.string().optional().default(''),
  instructions: z.string().min(1),
  ingredients: z.array(
    z.object({
      amount: z.string(),
      name: z.string(),
      details: z.string().optional().default(''),
    }),
  ).min(1),
});

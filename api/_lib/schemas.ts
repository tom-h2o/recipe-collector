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

export const extractPdfSchema = z.object({
  pdfBase64: z.string().min(1, 'pdfBase64 is required'),
});

const nullableInteger = z.preprocess(
  (value) => value === undefined || value === '' ? null : value,
  z.number().int().nonnegative().nullable(),
);

const stringFromUnknown = z.preprocess(
  (value) => Array.isArray(value) ? value.join('\n') : value == null ? '' : String(value),
  z.string(),
);

export const extractedRecipeSchema = z.object({
  title: z.string().min(1),
  description: z.string().default(''),
  original_language: z.string().length(2).default('en'),
  servings: nullableInteger,
  prep_time_mins: nullableInteger,
  cook_time_mins: nullableInteger,
  ingredients: z.array(
    z.object({
      amount: z.string().default(''),
      name: z.string().min(1),
      details: z.string().default(''),
    }),
  ).min(1),
  instructions: z.string().min(1),
  image_url: z.string().default(''),
  source_name: z.string().default(''),
});

export const tagResultSchema = z.array(z.string()).min(1);

export const nutritionResultSchema = z.object({
  calories: z.coerce.number().int().nonnegative(),
  protein_g: z.coerce.number().int().nonnegative(),
  carbs_g: z.coerce.number().int().nonnegative(),
  fat_g: z.coerce.number().int().nonnegative(),
  fiber_g: z.coerce.number().int().nonnegative(),
});

export const shoppingResultSchema = z.array(
  z.object({
    category: z.string().min(1),
    items: z.array(z.string().min(1)).min(1),
  }),
);

export const scaledIngredientsResultSchema = z.array(
  z.object({
    amount: z.string().default(''),
    name: z.string().min(1),
    details: z.string().default(''),
  }),
).min(1);

export const suggestResultSchema = z.array(z.string().uuid());

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
  }),
  z.object({
    action: z.literal('accept'),
    shareId: z.string().uuid(),
  }),
  z.object({
    action: z.literal('reject'),
    shareId: z.string().uuid(),
  }),
]);

export const translateSchema = z.object({
  recipeId: z.string().uuid('recipeId must be a UUID'),
  targetLanguage: z.enum(['en', 'de', 'fr', 'es', 'pl'], { message: 'Unsupported language' }),
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

export const translationResultSchema = z.object({
  detectedSourceLanguage: z.preprocess(
    (value) => value == null ? undefined : String(value).slice(0, 2).toLowerCase(),
    z.string().length(2).optional(),
  ),
  title: stringFromUnknown.pipe(z.string().min(1)),
  description: stringFromUnknown,
  instructions: stringFromUnknown.pipe(z.string().min(1)),
  ingredients: z.array(
    z.preprocess(
      (value) => {
        if (typeof value === 'string') return { amount: '', name: value, details: '' };
        return value;
      },
      z.object({
        amount: stringFromUnknown,
        name: stringFromUnknown.pipe(z.string().min(1)),
        details: stringFromUnknown,
      }),
    ),
  ).min(1),
});

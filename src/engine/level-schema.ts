import { z } from 'zod';

import {
  ITEM_CATEGORIES,
  ITEM_VARIANTS_BY_CATEGORY,
  type ItemCategory,
} from './types';

const LEVEL_OBJECTIVES = ['clean-sort'] as const;
const LEVEL_ITEM_STABILITIES = ['stable', 'unstable', 'volatile'] as const;

export type LevelItemStability = (typeof LEVEL_ITEM_STABILITIES)[number];

export type LevelDefinition = {
  id: string;
  chapter: number;
  levelNumber: number;
  stagingCapacity: number;
  moveBudget: number | null;
  objective: 'clean-sort';
  sourceBins: Array<{
    id: string;
    layers: Array<
      Array<{
        category: ItemCategory;
        variant: string;
        stability?: LevelItemStability;
        timer?: number;
      }>
    >;
  }>;
  destinationBins: Array<{
    id: string;
    accepts: ItemCategory;
  }>;
};

const itemCategorySchema = z.custom<ItemCategory>(
  (value): value is ItemCategory =>
    typeof value === 'string' &&
    ITEM_CATEGORIES.includes(value as ItemCategory),
  {
    message: 'Invalid item category.',
  },
);

const levelItemSchema = z
  .object({
    category: itemCategorySchema,
    variant: z.string().min(1),
    stability: z.enum(LEVEL_ITEM_STABILITIES).default('stable'),
    timer: z.number().int().nonnegative().optional(),
  })
  .superRefine((item, ctx) => {
    const validVariants = ITEM_VARIANTS_BY_CATEGORY[item.category];
    if (!validVariants.some((variant) => variant === item.variant)) {
      ctx.addIssue({
        code: 'custom',
        path: ['variant'],
        message: `Variant "${item.variant}" is not valid for category "${item.category}".`,
      });
    }

    const requiresTimer =
      item.stability === 'unstable' || item.stability === 'volatile';
    if (requiresTimer && item.timer === undefined) {
      ctx.addIssue({
        code: 'custom',
        path: ['timer'],
        message: `Timer is required when stability is "${item.stability}".`,
      });
    }
  });

const sourceBinSchema = z.object({
  id: z.string().min(1),
  layers: z.array(z.array(levelItemSchema).min(1)).min(1),
});

const destinationBinSchema = z.object({
  id: z.string().min(1),
  accepts: itemCategorySchema,
});

export const levelDefinitionSchema: z.ZodType<LevelDefinition> = z
  .object({
    id: z.string().min(1),
    chapter: z.number().int().positive(),
    levelNumber: z.number().int().positive(),
    stagingCapacity: z.number().int().nonnegative(),
    moveBudget: z.number().int().positive().nullable(),
    objective: z.enum(LEVEL_OBJECTIVES),
    sourceBins: z.array(sourceBinSchema).min(1),
    destinationBins: z.array(destinationBinSchema).min(1),
  })
  .superRefine((level, ctx) => {
    const sourceIds = new Set<string>();
    level.sourceBins.forEach((sourceBin, index) => {
      if (sourceIds.has(sourceBin.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['sourceBins', index, 'id'],
          message: `Duplicate source bin id "${sourceBin.id}".`,
        });
      }
      sourceIds.add(sourceBin.id);
    });

    const allBinIds = new Set(sourceIds);
    level.destinationBins.forEach((destinationBin, index) => {
      if (allBinIds.has(destinationBin.id)) {
        ctx.addIssue({
          code: 'custom',
          path: ['destinationBins', index, 'id'],
          message: `Duplicate bin id "${destinationBin.id}".`,
        });
      }
      allBinIds.add(destinationBin.id);
    });
  });

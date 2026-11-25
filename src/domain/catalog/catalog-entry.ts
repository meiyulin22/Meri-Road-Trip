import { z } from "zod";

/**
 * One record of Meri's own catalog (the private meri-catalog-cn repo, one NDJSON line each).
 * The schemas are strict so a change of the catalog's format fails the import instead of
 * slipping through. `historical` (old prices, hours, access) and `source_refs` are kept for
 * provenance but never shown to travellers.
 */
export const catalogKinds = ["spot", "dish", "restaurant", "stay", "transport", "tip"] as const;
export type CatalogKind = (typeof catalogKinds)[number];

const nullableText = z.string().min(1).nullable();
const textList = z.array(z.string().min(1));

const sourceRefSchema = z.strictObject({
  document_id: z.string().min(1),
  pdf_pages: z.array(z.number().int().positive()).min(1),
  guide_year: z.number().int().nullable(),
});

const relatedSchema = z.strictObject({
  id: z.string().min(1),
  relation: z.string().min(1),
});

const identityCheckSchema = z.strictObject({
  status: z.string().min(1),
  provider: z.string().nullable(),
  poi_id: z.string().nullable(),
}).nullable();

const commonFields = {
  schema_version: z.literal(1),
  id: z.string().regex(/^[a-z][a-z0-9_]*$/),
  name: z.string().min(1),
  aliases: textList,
  location: z.strictObject({
    province: z.string().min(1),
    prefecture: z.string().min(1),
    county: nullableText,
  }),
  summary: z.string().min(1),
  tags: textList,
  related: z.array(relatedSchema),
  historical: z.record(z.string(), z.string()).nullable(),
  source_refs: z.array(sourceRefSchema).min(1),
  confidence: z.enum(["high", "medium", "low"]),
  identity_check: identityCheckSchema,
};

const spotSchema = z.strictObject({
  ...commonFields,
  kind: z.literal("spot"),
  details: z.strictObject({
    highlights: textList,
    suggested_hours: z.number().positive().nullable(),
    best_season: nullableText,
    visit_note: nullableText,
    walking: z.strictObject({
      distance_m: z.number().nonnegative().nullable(),
      terrain: nullableText,
      stairs: z.boolean().nullable(),
    }),
  }),
});

const dishSchema = z.strictObject({
  ...commonFields,
  kind: z.literal("dish"),
  details: z.strictObject({ ingredients: textList, flavor: nullableText, preparations: textList }),
});

const restaurantSchema = z.strictObject({
  ...commonFields,
  kind: z.literal("restaurant"),
  details: z.strictObject({
    cuisine: nullableText,
    signature_dishes: textList,
    branch: nullableText,
    address: nullableText,
  }),
});

const staySchema = z.strictObject({
  ...commonFields,
  kind: z.literal("stay"),
  details: z.strictObject({
    stay_type: z.string().min(1),
    area: z.string().min(1),
    features: textList,
    branch: nullableText,
    address: nullableText,
  }),
});

const transportSchema = z.strictObject({
  ...commonFields,
  kind: z.literal("transport"),
  details: z.strictObject({ from: z.string().min(1), to: z.string().min(1), modes: textList }),
});

const tipSchema = z.strictObject({
  ...commonFields,
  kind: z.literal("tip"),
  details: z.strictObject({ applies_in: z.string().min(1), advice: z.string().min(1) }),
});

export const catalogEntrySchema = z.discriminatedUnion("kind", [
  spotSchema,
  dishSchema,
  restaurantSchema,
  staySchema,
  transportSchema,
  tipSchema,
]);

export type CatalogEntry = z.infer<typeof catalogEntrySchema>;

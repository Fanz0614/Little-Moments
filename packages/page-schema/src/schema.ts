import { z } from 'zod';

/**
 * PageDocument is the single source of truth for a journal page.
 *
 * Coordinates are in "page units", which equal PDF points (1/72 inch).
 * An A4 portrait page is 595 x 842. The renderer scales page units to the
 * screen; the exporter scales them to 300 dpi. Nothing else should invent
 * its own coordinate space.
 *
 * Layers are ordered bottom -> top.
 */

export const CURRENT_SCHEMA_VERSION = 1 as const;

export const A4_PORTRAIT = { width: 595, height: 842 } as const;

const hexColor = z.string().regex(/^#([0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/, 'expected #RRGGBB or #RRGGBBAA');

/** Axis-aligned box before rotation; rotation is in degrees around the box centre. */
export const FrameSchema = z.object({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  rotation: z.number().default(0),
});
export type Frame = z.infer<typeof FrameSchema>;

/** Region of the source image shown inside the frame, normalised to 0..1. */
export const CropSchema = z
  .object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().gt(0).max(1),
    height: z.number().gt(0).max(1),
  })
  .refine((c) => c.x + c.width <= 1.000001 && c.y + c.height <= 1.000001, {
    message: 'crop must stay inside the image',
  });
export type Crop = z.infer<typeof CropSchema>;

const LayerBase = {
  id: z.string().min(1),
  frame: FrameSchema,
};

export const PhotoLayerSchema = z.object({
  ...LayerBase,
  type: z.literal('photo'),
  /** Id of a row in the local photo store (not a Photos-library asset id). */
  photoId: z.string().min(1),
  crop: CropSchema,
  /**
   * White "print" border in page units. The frame is the outer box; the photo
   * is inset by this amount, and `crop` matches the inset box's aspect ratio.
   */
  borderWidth: z.number().min(0).default(0),
  borderColor: hexColor.default('#FFFFFF'),
  shadow: z.boolean().default(false),
  cornerRadius: z.number().min(0).default(0),
});
export type PhotoLayer = z.infer<typeof PhotoLayerSchema>;

export const FontRoleSchema = z.enum(['title', 'body', 'hand']);
export type FontRole = z.infer<typeof FontRoleSchema>;

export const TextStyleSchema = z.object({
  role: FontRoleSchema,
  fontSize: z.number().positive(),
  color: hexColor,
  align: z.enum(['left', 'center', 'right']).default('left'),
  bold: z.boolean().default(false),
  lineHeight: z.number().positive().default(1.4),
});
export type TextStyle = z.infer<typeof TextStyleSchema>;

export const TextLayerSchema = z.object({
  ...LayerBase,
  type: z.literal('text'),
  text: z.string(),
  style: TextStyleSchema,
  /**
   * Where the text came from. 'user' = typed by the user, 'template' = a
   * template default such as the date. Phase 2 adds 'ai-draft' so AI text is
   * always identifiable and never silently presented as the user's words.
   */
  source: z.enum(['user', 'template']).default('user'),
});
export type TextLayer = z.infer<typeof TextLayerSchema>;

export const StickerLayerSchema = z.object({
  ...LayerBase,
  type: z.literal('sticker'),
  stickerId: z.string().min(1),
  color: hexColor,
});
export type StickerLayer = z.infer<typeof StickerLayerSchema>;

export const LayerSchema = z.discriminatedUnion('type', [PhotoLayerSchema, TextLayerSchema, StickerLayerSchema]);
export type Layer = z.infer<typeof LayerSchema>;
export type LayerType = Layer['type'];

export const PageDocumentSchema = z.object({
  schemaVersion: z.literal(CURRENT_SCHEMA_VERSION),
  id: z.string().min(1),
  /** Calendar day the page is about, YYYY-MM-DD in the user's local time. */
  journalDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  templateId: z.string().min(1),
  size: z.object({ width: z.number().positive(), height: z.number().positive() }),
  background: z.object({ color: hexColor }),
  layers: z.array(LayerSchema),
  createdAt: z.number().int(),
  updatedAt: z.number().int(),
});
export type PageDocument = z.infer<typeof PageDocumentSchema>;

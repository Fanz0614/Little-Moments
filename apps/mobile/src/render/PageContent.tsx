import React, { memo, useMemo } from 'react';
import {
  DashPathEffect,
  Group,
  Image,
  Paragraph,
  Path,
  Rect,
  RoundedRect,
  Shadow,
  Skia,
  rect,
  rrect,
  type Transforms3d,
} from '@shopify/react-native-skia';
import type { SharedValue } from 'react-native-reanimated';
import {
  frameCenter,
  imageDrawRect,
  insetFrame,
  type Frame,
  type Layer,
  type PageDocument,
  type PhotoLayer,
  type StickerLayer,
  type TextLayer,
} from '@lm/page-schema';
import { getSticker } from '@lm/layout-engine';
import { makeParagraph } from './text';
import type { PhotoImages } from './useImages';

/** "#RRGGBBAA" -> "rgba(...)" so we don't depend on 8-digit hex parsing. */
export function cssColor(hex: string): string {
  if (hex.length !== 9) return hex;
  const n = (i: number) => parseInt(hex.slice(i, i + 2), 16);
  return `rgba(${n(1)}, ${n(3)}, ${n(5)}, ${(n(7) / 255).toFixed(3)})`;
}

const deg2rad = (d: number) => (d * Math.PI) / 180;

/** Wraps children in the frame's own rotation around its centre. */
function Rotated({ frame, children }: { frame: Frame; children: React.ReactNode }) {
  if (!frame.rotation) return <>{children}</>;
  const c = frameCenter(frame);
  return (
    <Group origin={c} transform={[{ rotate: deg2rad(frame.rotation) }]}>
      {children}
    </Group>
  );
}

const PhotoView = memo(function PhotoView({ layer, images }: { layer: PhotoLayer; images: PhotoImages }) {
  const f = layer.frame;
  const inner = insetFrame(f, layer.borderWidth);
  const img = images.get(layer.photoId)?.image ?? null;
  const draw = imageDrawRect(inner, layer.crop);
  const outerR = layer.borderWidth > 0 ? Math.min(2, layer.cornerRadius) : layer.cornerRadius;
  return (
    <Rotated frame={f}>
      {(layer.shadow || layer.borderWidth > 0) && (
        <RoundedRect x={f.x} y={f.y} width={f.width} height={f.height} r={outerR} color={cssColor(layer.borderColor)}>
          {layer.shadow && <Shadow dx={0} dy={3} blur={7} color="rgba(60, 40, 20, 0.22)" />}
        </RoundedRect>
      )}
      <Group clip={rrect(rect(inner.x, inner.y, inner.width, inner.height), layer.cornerRadius, layer.cornerRadius)}>
        {img ? (
          <Image image={img} x={draw.x} y={draw.y} width={draw.width} height={draw.height} fit="fill" />
        ) : (
          <Rect x={inner.x} y={inner.y} width={inner.width} height={inner.height} color="#E9E2D8" />
        )}
      </Group>
    </Rotated>
  );
});

const TextView = memo(function TextView({ layer }: { layer: TextLayer }) {
  const f = layer.frame;
  const paragraph = useMemo(() => makeParagraph(layer.text, layer.style, f.width), [layer.text, layer.style, f.width]);
  return (
    <Rotated frame={f}>
      <Paragraph paragraph={paragraph} x={f.x} y={f.y} width={f.width} />
    </Rotated>
  );
});

const stickerPaths = new Map<string, ReturnType<typeof Skia.Path.MakeFromSVGString>>();
function stickerPath(id: string) {
  if (!stickerPaths.has(id)) {
    const def = getSticker(id);
    stickerPaths.set(id, def ? Skia.Path.MakeFromSVGString(def.path) : null);
  }
  return stickerPaths.get(id) ?? null;
}

const StickerView = memo(function StickerView({ layer }: { layer: StickerLayer }) {
  const f = layer.frame;
  const path = stickerPath(layer.stickerId);
  if (!path) return null;
  return (
    <Rotated frame={f}>
      <Group transform={[{ translateX: f.x }, { translateY: f.y }, { scaleX: f.width / 24 }, { scaleY: f.height / 24 }]}>
        <Path path={path} color={cssColor(layer.color)} />
      </Group>
    </Rotated>
  );
});

function SelectionOutline({ frame }: { frame: Frame }) {
  const pad = 4;
  return (
    <Rotated frame={frame}>
      <Rect
        x={frame.x - pad}
        y={frame.y - pad}
        width={frame.width + pad * 2}
        height={frame.height + pad * 2}
        style="stroke"
        strokeWidth={1.5}
        color="#D98C6A"
      >
        <DashPathEffect intervals={[6, 4]} />
      </Rect>
    </Rotated>
  );
}

export function LayerView({ layer, images }: { layer: Layer; images: PhotoImages }) {
  switch (layer.type) {
    case 'photo':
      return <PhotoView layer={layer} images={images} />;
    case 'text':
      return <TextView layer={layer} />;
    case 'sticker':
      return <StickerView layer={layer} />;
  }
}

export type LiveTransform = {
  layerId: string | null;
  transform: SharedValue<Transforms3d>;
};

/**
 * Draws a page in page units. The caller scales it (screen or export).
 * When `live` targets a layer, that layer is drawn under a gesture-driven
 * transform so dragging/pinching never re-renders React until the gesture ends.
 */
export function PageContent({
  doc,
  images,
  selectedId,
  live,
}: {
  doc: PageDocument;
  images: PhotoImages;
  selectedId?: string | null;
  live?: LiveTransform;
}) {
  return (
    <Group>
      <Rect x={0} y={0} width={doc.size.width} height={doc.size.height} color={cssColor(doc.background.color)} />
      {doc.layers.map((layer) => {
        const isSelected = layer.id === selectedId;
        const body = (
          <>
            <LayerView layer={layer} images={images} />
            {isSelected && <SelectionOutline frame={layer.frame} />}
          </>
        );
        if (live && live.layerId === layer.id) {
          return (
            <Group key={layer.id} origin={frameCenter(layer.frame)} transform={live.transform}>
              {body}
            </Group>
          );
        }
        return <Group key={layer.id}>{body}</Group>;
      })}
    </Group>
  );
}

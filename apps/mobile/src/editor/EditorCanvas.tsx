import React, { useEffect, useLayoutEffect, useMemo } from 'react';
import { Canvas, Group, type Transforms3d } from '@shopify/react-native-skia';
import { useDerivedValue, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import {
  GestureDetector,
  usePanGesture,
  usePinchGesture,
  useRotationGesture,
  useSimultaneousGestures,
  useTapGesture,
} from 'react-native-gesture-handler';
import type { Frame, LayerTransform, PageDocument } from '@lm/page-schema';
import { PageContent } from '@/render/PageContent';
import type { PhotoImages } from '@/render/useImages';

type HitBox = { id: string; x: number; y: number; w: number; h: number; rot: number };

/** Topmost layer under a page-space point. Runs on the UI thread. */
function hitTest(boxes: HitBox[], px: number, py: number, slop: number): string | null {
  'worklet';
  for (let i = boxes.length - 1; i >= 0; i--) {
    const b = boxes[i]!;
    const cx = b.x + b.w / 2;
    const cy = b.y + b.h / 2;
    const r = (-b.rot * Math.PI) / 180;
    const dx = px - cx;
    const dy = py - cy;
    const lx = dx * Math.cos(r) - dy * Math.sin(r);
    const ly = dx * Math.sin(r) + dy * Math.cos(r);
    if (Math.abs(lx) <= b.w / 2 + slop && Math.abs(ly) <= b.h / 2 + slop) return b.id;
  }
  return null;
}

const toBox = (id: string, f: Frame): HitBox => ({ id, x: f.x, y: f.y, w: f.width, h: f.height, rot: f.rotation ?? 0 });

/**
 * Gesture model
 * - tap: select the topmost layer (or clear selection on empty paper)
 * - one-finger drag: grabs the layer under the finger, moves it
 * - two fingers: pinch scales / twist rotates the selected layer
 *
 * During a gesture only shared values change (UI thread, no React renders).
 * When the last finger lifts, the accumulated transform is committed once to
 * the document via onCommit.
 */
export function EditorCanvas({
  doc,
  images,
  width,
  selectedId,
  onSelect,
  onCommit,
}: {
  doc: PageDocument;
  images: PhotoImages;
  /** On-screen width of the page in dp; height follows the page aspect ratio. */
  width: number;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onCommit: (id: string, t: LayerTransform) => void;
}) {
  const s = width / doc.size.width;
  const height = doc.size.height * s;

  const scaleSV = useSharedValue(s);
  const boxes = useSharedValue<HitBox[]>([]);
  // selectedSV mirrors React's confirmed selection (which layer the live
  // transform is rendered on). targetSV is what the current gesture grabbed;
  // it can run a few ms ahead of React. Until they match, deltas accumulate
  // but are not drawn, so a newly grabbed layer catches up instead of the
  // previously selected one moving.
  const selectedSV = useSharedValue<string | null>(selectedId);
  const targetSV = useSharedValue<string | null>(selectedId);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const sc = useSharedValue(1);
  const rot = useSharedValue(0); // radians
  const pinchBase = useSharedValue(1);
  const rotBase = useSharedValue(0);
  const active = useSharedValue(0);

  useEffect(() => {
    scaleSV.set(s);
  }, [s, scaleSV]);

  useEffect(() => {
    boxes.set(doc.layers.map((l) => toBox(l.id, l.frame)));
  }, [doc.layers, boxes]);

  useEffect(() => {
    selectedSV.set(selectedId);
    targetSV.set(selectedId);
  }, [selectedId, selectedSV, targetSV]);

  // The committed doc has re-rendered with the new frame: drop the live delta
  // in the same commit so the layer doesn't jump back for a frame.
  useLayoutEffect(() => {
    tx.set(0);
    ty.set(0);
    sc.set(1);
    rot.set(0);
  }, [doc, tx, ty, sc, rot]);

  const liveTransform = useDerivedValue<Transforms3d>(() => {
    const target = targetSV.get();
    return target !== null && target === selectedSV.get()
      ? [{ translateX: tx.get() }, { translateY: ty.get() }, { scale: sc.get() }, { rotate: rot.get() }]
      : [];
  });

  const finish = () => {
    'worklet';
    const remaining = Math.max(0, active.get() - 1);
    active.set(remaining);
    if (remaining > 0) return;
    const id = targetSV.get();
    const t = { dx: tx.get(), dy: ty.get(), scale: sc.get(), rotationDeg: (rot.get() * 180) / Math.PI };
    const moved = t.dx !== 0 || t.dy !== 0 || t.scale !== 1 || t.rotationDeg !== 0;
    if (id && moved) scheduleOnRN(onCommit, id, t);
  };

  const tap = useTapGesture({
    onDeactivate: (e) => {
      'worklet';
      if (e.canceled) return;
      const k = scaleSV.get();
      const hit = hitTest(boxes.get(), e.x / k, e.y / k, 6 / k);
      targetSV.set(hit);
      scheduleOnRN(onSelect, hit);
    },
  });

  const pan = usePanGesture({
    maxPointers: 2,
    onBegin: (e) => {
      'worklet';
      active.set(active.get() + 1);
      if (e.numberOfPointers > 1) return;
      const k = scaleSV.get();
      const px = e.x / k;
      const py = e.y / k;
      const all = boxes.get();
      const current = targetSV.get();
      const currentBox = current ? all.find((b) => b.id === current) : undefined;
      // Keep dragging the selected layer if the finger is on it, even when another layer is on top.
      if (currentBox && hitTest([currentBox], px, py, 10 / k)) return;
      const hit = hitTest(all, px, py, 6 / k);
      if (hit !== current) {
        targetSV.set(hit);
        scheduleOnRN(onSelect, hit);
      }
    },
    onUpdate: (e) => {
      'worklet';
      if (!targetSV.get()) return;
      const k = scaleSV.get();
      tx.set(tx.get() + e.changeX / k);
      ty.set(ty.get() + e.changeY / k);
    },
    onFinalize: () => {
      'worklet';
      finish();
    },
  });

  const pinch = usePinchGesture({
    onBegin: () => {
      'worklet';
      active.set(active.get() + 1);
      pinchBase.set(sc.get());
    },
    onUpdate: (e) => {
      'worklet';
      if (!targetSV.get()) return;
      sc.set(Math.min(6, Math.max(0.15, pinchBase.get() * e.scale)));
    },
    onFinalize: () => {
      'worklet';
      finish();
    },
  });

  const rotation = useRotationGesture({
    onBegin: () => {
      'worklet';
      active.set(active.get() + 1);
      rotBase.set(rot.get());
    },
    onUpdate: (e) => {
      'worklet';
      if (!targetSV.get()) return;
      rot.set(rotBase.get() + e.rotation);
    },
    onFinalize: () => {
      'worklet';
      finish();
    },
  });

  const gesture = useSimultaneousGestures(tap, pan, pinch, rotation);
  const live = useMemo(() => ({ layerId: selectedId, transform: liveTransform }), [selectedId, liveTransform]);

  return (
    <GestureDetector gesture={gesture}>
      <Canvas style={{ width, height }}>
        <Group transform={[{ scale: s }]}>
          <PageContent doc={doc} images={images} selectedId={selectedId} live={live} />
        </Group>
      </Canvas>
    </GestureDetector>
  );
}

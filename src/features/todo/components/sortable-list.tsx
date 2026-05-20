'use no memo';

import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  LayoutChangeEvent,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  scrollTo,
  useAnimatedReaction,
  useAnimatedRef,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';

export type RenderItemArgs<T> = {
  item: T;
  drag: () => void;
  isActive: boolean;
};

export type SortableListProps<T> = {
  data: T[];
  keyExtractor: (item: T) => string;
  renderItem: (args: RenderItemArgs<T>) => React.ReactElement;
  onDragEnd: (params: { data: T[]; from: number; to: number }) => void;
  /** Whether an item participates in reorder. Non-draggable items stay anchored. */
  canDrag?: (item: T) => boolean;
  /** How far the finger must travel before drag activates. Use a huge number to disable. */
  activationDistance?: number;
  /** Fires on a quick tap (<8px movement) when long-press drag did NOT win.
   *  Composed at the row level via Gesture.Exclusive so a long-press hold
   *  starts drag and suppresses the tap automatically. */
  onItemTap?: (item: T, index: number) => void;
  ListHeaderComponent?: React.ReactElement;
  contentContainerStyle?: StyleProp<ViewStyle>;
};

const DEFAULT_ROW_HEIGHT = 56;
const AUTOSCROLL_THRESHOLD = 60;
const AUTOSCROLL_MAX_SPEED = 12; // px per frame
const SPRING_CONFIG = { damping: 22, stiffness: 220, mass: 0.6 } as const;

type RowSV = {
  height: SharedValue<number>;
  baseY: SharedValue<number>;
  visualY: SharedValue<number>;
};

type RowRegistry = Map<string, RowSV>;

type DragState = {
  /** key of the item currently being dragged, or null when idle. */
  draggedKey: SharedValue<string | null>;
  /** original index of dragged item. */
  fromIndex: SharedValue<number>;
  /** current target landing index. */
  toIndex: SharedValue<number>;
  /** translateY accumulated from pan gesture (relative to drag start). */
  panTranslation: SharedValue<number>;
  /** absolute Y of the finger on screen. */
  panAbsoluteY: SharedValue<number>;
  /** original visualY of the dragged row at activation time. */
  dragOriginY: SharedValue<number>;
  /** mirror of `keyExtractor(data[i])` for worklet access. */
  keys: SharedValue<string[]>;
  /** mirror of heights map. */
  heights: SharedValue<Record<string, number>>;
};

type RowProps<T> = {
  item: T;
  index: number;
  itemKey: string;
  draggable: boolean;
  activationDistance: number;
  registry: RowRegistry;
  drag: DragState;
  onMeasured: (key: string, height: number) => void;
  onActivate: (index: number) => void;
  onMove: (translation: number, absoluteY: number) => void;
  onRelease: () => void;
  onItemTap?: (item: T, index: number) => void;
  renderItem: (args: RenderItemArgs<T>) => React.ReactElement;
};

function Row<T>(props: RowProps<T>) {
  const {
    item,
    itemKey,
    index,
    draggable,
    activationDistance,
    registry,
    drag,
    onMeasured,
    onActivate,
    onMove,
    onRelease,
    onItemTap,
    renderItem,
  } = props;

  // Allocate this row's shared values exactly once.
  const height = useSharedValue<number>(DEFAULT_ROW_HEIGHT);
  const baseY = useSharedValue<number>(0);
  const visualY = useSharedValue<number>(0);
  const rowWidth = useSharedValue<number>(0);

  // Register / unregister with the parent's lookup.
  useEffect(() => {
    registry.set(itemKey, { height, baseY, visualY });
    return () => {
      registry.delete(itemKey);
    };
  }, [itemKey, registry, height, baseY, visualY]);

  const [active, setActive] = useState(false);
  useAnimatedReaction(
    () => drag.draggedKey.value === itemKey,
    (cur, prev) => {
      if (cur !== prev) runOnJS(setActive)(cur);
    },
    [itemKey],
  );

  const handleLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const h = e.nativeEvent.layout.height;
      const w = e.nativeEvent.layout.width;
      if (height.value !== h) height.value = h;
      rowWidth.value = w;
      onMeasured(itemKey, h);
    },
    [height, itemKey, onMeasured, rowWidth],
  );

  const triggerDrag = useCallback(() => {
    if (!draggable) return;
    onActivate(index);
  }, [draggable, index, onActivate]);

  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: visualY.value }],
      zIndex: drag.draggedKey.value === itemKey ? 999 : 1,
      elevation: drag.draggedKey.value === itemKey ? 8 : 0,
    };
  });

  const pan = useMemo(() => {
    return Gesture.Pan()
      .activateAfterLongPress(250)
      .minDistance(0)
      .enabled(draggable)
      .onStart(() => {
        'worklet';
        runOnJS(onActivate)(index);
      })
      .onUpdate((e) => {
        'worklet';
        if (Math.abs(e.translationY) < activationDistance) {
          runOnJS(onMove)(0, e.absoluteY);
          return;
        }
        runOnJS(onMove)(e.translationY, e.absoluteY);
      })
      .onEnd(() => {
        'worklet';
        runOnJS(onRelease)();
      })
      .onFinalize(() => {
        'worklet';
        runOnJS(onRelease)();
      });
  }, [activationDistance, draggable, index, onActivate, onMove, onRelease]);

  const tap = useMemo(() => {
    return Gesture.Tap()
      .maxDistance(8)
      .enabled(!!onItemTap)
      .onEnd((event, success) => {
        'worklet';
        if (!success || !onItemTap) return;
        // The TaskRow's check button lives at the row's right edge — a
        // 28px icon with hitSlop=16 sitting inside the row's 24px right
        // padding. Touches in that zone are handled by the check
        // Pressable's own NativeButton, but gesture-handler still fires
        // the outer Tap simultaneously. Skip those so the check toggle
        // doesn't also open the edit modal.
        const CHECK_ZONE_WIDTH = 70;
        if (event.x > rowWidth.value - CHECK_ZONE_WIDTH) return;
        runOnJS(onItemTap)(item, index);
      });
  }, [item, index, onItemTap, rowWidth]);

  // Exclusive: pan has priority. If pan reaches its long-press threshold
  // (250ms hold), tap is forced to fail. Quick releases activate tap.
  const composed = useMemo(
    () => Gesture.Exclusive(pan, tap),
    [pan, tap],
  );

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        onLayout={handleLayout}
        style={[styles.row, animatedStyle]}
      >
        {renderItem({ item, drag: triggerDrag, isActive: active })}
      </Animated.View>
    </GestureDetector>
  );
}

export function SortableList<T>(props: SortableListProps<T>) {
  const {
    data,
    keyExtractor,
    renderItem,
    onDragEnd,
    canDrag,
    activationDistance = 0,
    onItemTap,
    ListHeaderComponent,
    contentContainerStyle,
  } = props;

  const scrollRef = useAnimatedRef<Animated.ScrollView>();
  const scrollY = useSharedValue<number>(0);
  const containerHeight = useSharedValue<number>(0);
  const containerTopOnScreen = useSharedValue<number>(0);

  const registryRef = useRef<RowRegistry>(new Map());

  const [heightsState, setHeightsState] = useState<Record<string, number>>({});

  // Drag shared values bundled together for child access.
  const draggedKey = useSharedValue<string | null>(null);
  const fromIndex = useSharedValue<number>(-1);
  const toIndex = useSharedValue<number>(-1);
  const panTranslation = useSharedValue<number>(0);
  const panAbsoluteY = useSharedValue<number>(0);
  const dragOriginY = useSharedValue<number>(0);

  const keys = useMemo(() => data.map((d) => keyExtractor(d)), [data, keyExtractor]);
  const keysSV = useSharedValue<string[]>(keys);
  const heightsSV = useSharedValue<Record<string, number>>(heightsState);

  useEffect(() => {
    keysSV.value = keys;
  }, [keys, keysSV]);
  useEffect(() => {
    heightsSV.value = heightsState;
  }, [heightsState, heightsSV]);

  const drag: DragState = useMemo(
    () => ({
      draggedKey,
      fromIndex,
      toIndex,
      panTranslation,
      panAbsoluteY,
      dragOriginY,
      keys: keysSV,
      heights: heightsSV,
    }),
    [
      dragOriginY,
      draggedKey,
      fromIndex,
      heightsSV,
      keysSV,
      panAbsoluteY,
      panTranslation,
      toIndex,
    ],
  );

  // Compute resting positions from cumulative heights.
  const positions = useMemo(() => {
    const map: Record<string, number> = {};
    let y = 0;
    for (const k of keys) {
      map[k] = y;
      y += heightsState[k] ?? DEFAULT_ROW_HEIGHT;
    }
    return { map, total: y };
  }, [keys, heightsState]);

  const totalHeight = positions.total;

  // A worklet-readable mirror of the registry map. Updated from JS whenever
  // rows mount/unmount (declared before the placement reaction so the
  // closure binding is initialized when the reaction's worklet first runs).
  const rowSVMap = useSharedValue<Record<string, RowSV>>({});

  // Tracks which keys have been seen before so first-time rows can snap
  // directly to their resting Y instead of sliding from translateY=0 (top of
  // the list). Without this, a newly mounted row in `evening` visibly streaks
  // from the morning header down to its slot.
  const prevKeysRef = useRef<Set<string>>(new Set());

  // Update baseY for each row when positions change and no drag is active.
  useEffect(() => {
    if (draggedKey.value !== null) return;
    for (const k of keys) {
      const sv = registryRef.current.get(k);
      if (!sv) continue;
      const target = positions.map[k] ?? 0;
      sv.baseY.value = target;
      if (!prevKeysRef.current.has(k)) {
        sv.visualY.value = target;
      } else {
        sv.visualY.value = withTiming(target, {
          duration: 280,
          easing: Easing.bezier(0.4, 0, 0.2, 1),
        });
      }
    }
    prevKeysRef.current = new Set(keys);
  }, [positions, keys, draggedKey]);

  // If `canDrag` flips such that the currently-dragged item is no longer
  // draggable (e.g. voice mode just turned on while the user was mid-drag),
  // cancel the drag and snap rows back to their slot positions. Without this
  // the dragged row stays floating mid-screen until the next gesture.
  useEffect(() => {
    if (!canDrag) return;
    const key = draggedKey.value;
    if (key == null) return;
    const idx = keys.indexOf(key);
    if (idx < 0) return;
    const item = data[idx];
    if (canDrag(item)) return;
    draggedKey.value = null;
    fromIndex.value = -1;
    toIndex.value = -1;
    panTranslation.value = 0;
    for (const k of keys) {
      const sv = registryRef.current.get(k);
      if (!sv) continue;
      sv.visualY.value = withSpring(sv.baseY.value, SPRING_CONFIG);
    }
  }, [canDrag, data, keys, draggedKey, fromIndex, toIndex, panTranslation]);

  // Reaction: while dragging, place the dragged row under the finger and
  // shift other rows out of the way by recomputing their target Y from a
  // displayed-order list with the dragged item inserted at the landing index.
  useAnimatedReaction(
    () => ({
      key: draggedKey.value,
      translation: panTranslation.value,
      origin: dragOriginY.value,
      from: fromIndex.value,
      heights: heightsSV.value,
      keys: keysSV.value,
    }),
    (cur) => {
      'worklet';
      if (!cur.key || cur.from < 0) return;

      const draggedH = cur.heights[cur.key] ?? DEFAULT_ROW_HEIGHT;
      // Clamp the dragged row to the list's vertical bounds so it can't
      // float above the section headers into the WeeklyCalendar area
      // (or below the last row into the tab-bar). The lower bound is
      // the bottom edge of the first item (the topmost section header
      // in our use case), so the dragged row can't visually overlap or
      // pass above the Morning pill.
      let totalH = 0;
      for (const k of cur.keys) totalH += cur.heights[k] ?? DEFAULT_ROW_HEIGHT;
      const firstKey = cur.keys[0];
      const minTop = firstKey ? (cur.heights[firstKey] ?? 0) : 0;
      const maxTop = Math.max(minTop, totalH - draggedH);
      const rawTop = cur.origin + cur.translation;
      const draggedTop = Math.max(minTop, Math.min(rawTop, maxTop));
      const draggedCenter = draggedTop + draggedH / 2;
      const n = cur.keys.length;

      // Build the non-dragged ordered key list once.
      const nonDragged: string[] = [];
      for (let i = 0; i < n; i++) {
        if (cur.keys[i] !== cur.key) nonDragged.push(cur.keys[i]);
      }

      // Find landing slot among the non-dragged rows by walking cumulative
      // heights and comparing to the dragged center.
      let landed = nonDragged.length; // default to end
      let cum = 0;
      for (let i = 0; i < nonDragged.length; i++) {
        const h = cur.heights[nonDragged[i]] ?? DEFAULT_ROW_HEIGHT;
        if (draggedCenter < cum + h) {
          landed = i;
          break;
        }
        cum += h;
      }
      // Clamp.
      if (landed < 0) landed = 0;
      if (landed > nonDragged.length) landed = nonDragged.length;

      // The "to" index in the original keys list: it's `landed` because once
      // we splice the dragged item out, indices in `nonDragged` are exactly
      // the positions where insertion lands in a length-n array.
      // (Insert before position `landed` in nonDragged → final index `landed`
      // in the rebuilt array.)
      // Bound by n-1 (must be a valid index in result of length n).
      const finalTo = landed >= n ? n - 1 : landed;
      toIndex.value = finalTo;

      // Build displayed order with dragged inserted at `landed`.
      const displayed: string[] = new Array(n);
      let j = 0;
      for (let i = 0; i < n; i++) {
        if (i === landed) {
          displayed[i] = cur.key;
        } else {
          displayed[i] = nonDragged[j++];
        }
      }
      if (landed === n) {
        // Insertion past the end: place at last slot.
        for (let i = 0; i < n - 1; i++) displayed[i] = nonDragged[i];
        displayed[n - 1] = cur.key;
      }

      // Assign target Y for non-dragged rows; dragged follows finger directly.
      let yAcc = 0;
      for (let i = 0; i < n; i++) {
        const k = displayed[i];
        const h = cur.heights[k] ?? DEFAULT_ROW_HEIGHT;
        const sv = (rowSVMap.value as Record<string, RowSV | undefined>)[k];
        if (sv) {
          if (k === cur.key) {
            sv.visualY.value = draggedTop;
          } else {
            sv.visualY.value = withSpring(yAcc, SPRING_CONFIG);
          }
        }
        yAcc += h;
      }
    },
    [],
  );

  // Sync the worklet-readable rowSVMap whenever rows register/unregister.
  useEffect(() => {
    const obj: Record<string, RowSV> = {};
    registryRef.current.forEach((v, k) => {
      obj[k] = v;
    });
    rowSVMap.value = obj;
  }, [keys, heightsState, rowSVMap]);

  // Auto-scroll near edges.
  useAnimatedReaction(
    () => ({
      key: draggedKey.value,
      absY: panAbsoluteY.value,
      containerH: containerHeight.value,
      containerTop: containerTopOnScreen.value,
      scroll: scrollY.value,
      total: totalHeight,
    }),
    (cur) => {
      'worklet';
      if (!cur.key) return;
      const localY = cur.absY - cur.containerTop;
      const distFromTop = localY;
      const distFromBottom = cur.containerH - localY;

      let delta = 0;
      if (distFromTop < AUTOSCROLL_THRESHOLD && distFromTop >= 0) {
        const ratio = 1 - distFromTop / AUTOSCROLL_THRESHOLD;
        delta = -AUTOSCROLL_MAX_SPEED * ratio;
      } else if (distFromBottom < AUTOSCROLL_THRESHOLD && distFromBottom >= 0) {
        const ratio = 1 - distFromBottom / AUTOSCROLL_THRESHOLD;
        delta = AUTOSCROLL_MAX_SPEED * ratio;
      }

      if (delta !== 0) {
        const next = Math.max(
          0,
          Math.min(cur.scroll + delta, Math.max(0, cur.total - cur.containerH)),
        );
        scrollTo(scrollRef, 0, next, false);
      }
    },
    [totalHeight],
  );

  const handleMeasured = useCallback((key: string, h: number) => {
    setHeightsState((prev) => {
      if (prev[key] === h) return prev;
      return { ...prev, [key]: h };
    });
  }, []);

  const handleActivate = useCallback(
    (index: number) => {
      const key = keys[index];
      if (!key) return;
      const item = data[index];
      if (canDrag && !canDrag(item)) return;
      const sv = registryRef.current.get(key);
      if (!sv) return;
      cancelAnimation(sv.visualY);
      draggedKey.value = key;
      fromIndex.value = index;
      toIndex.value = index;
      dragOriginY.value = sv.visualY.value;
      panTranslation.value = 0;
    },
    [
      canDrag,
      data,
      dragOriginY,
      draggedKey,
      fromIndex,
      keys,
      panTranslation,
      toIndex,
    ],
  );

  const handleMove = useCallback(
    (translation: number, absoluteY: number) => {
      if (draggedKey.value == null) return;
      panTranslation.value = translation;
      panAbsoluteY.value = absoluteY;
    },
    [draggedKey, panAbsoluteY, panTranslation],
  );

  const handleRelease = useCallback(() => {
    const key = draggedKey.value;
    if (key == null) return;
    const from = fromIndex.value;
    const to = toIndex.value;

    const next = data.slice();
    if (from >= 0 && to >= 0 && from < next.length && to < next.length) {
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved);
    }

    draggedKey.value = null;
    fromIndex.value = -1;
    toIndex.value = -1;
    panTranslation.value = 0;

    for (const k of keys) {
      const sv = registryRef.current.get(k);
      if (!sv) continue;
      sv.visualY.value = withSpring(sv.baseY.value, SPRING_CONFIG);
    }

    onDragEnd({
      data: next,
      from: from < 0 ? 0 : from,
      to: to < 0 ? 0 : to,
    });
  }, [
    data,
    draggedKey,
    fromIndex,
    keys,
    onDragEnd,
    panTranslation,
    toIndex,
  ]);

  const onScroll = useAnimatedScrollHandler({
    onScroll: (e) => {
      scrollY.value = e.contentOffset.y;
    },
  });

  const onContainerLayout = useCallback(
    (e: LayoutChangeEvent) => {
      containerHeight.value = e.nativeEvent.layout.height;
      containerTopOnScreen.value = e.nativeEvent.layout.y;
    },
    [containerHeight, containerTopOnScreen],
  );

  const draggableFlags = useMemo(() => {
    if (!canDrag) return data.map(() => true);
    return data.map((d) => canDrag(d));
  }, [canDrag, data]);

  return (
    <Animated.ScrollView
      ref={scrollRef}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onLayout={onContainerLayout}
      contentContainerStyle={contentContainerStyle}
      showsVerticalScrollIndicator={false}
    >
      {ListHeaderComponent ? <View>{ListHeaderComponent}</View> : null}
      <View style={[styles.list, { height: totalHeight }]}>
        {data.map((item, index) => {
          const k = keys[index];
          return (
            <Row
              key={k}
              item={item}
              index={index}
              itemKey={k}
              draggable={draggableFlags[index]}
              activationDistance={activationDistance}
              registry={registryRef.current}
              drag={drag}
              onMeasured={handleMeasured}
              onActivate={handleActivate}
              onMove={handleMove}
              onRelease={handleRelease}
              onItemTap={onItemTap}
              renderItem={renderItem}
            />
          );
        })}
      </View>
    </Animated.ScrollView>
  );
}

const styles = StyleSheet.create({
  list: {
    position: 'relative',
    width: '100%',
  },
  row: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
  },
});

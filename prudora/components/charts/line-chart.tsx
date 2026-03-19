import { useColor } from '@/hooks/useColor';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  StyleSheet,
  Text,
  View,
  ViewStyle,
} from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedProps,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
  type SharedValue,
} from 'react-native-reanimated';
import Svg, {
  Circle as SvgCircle,
  Defs,
  G,
  Line,
  LinearGradient,
  Path as SvgPath,
  Stop,
  Text as SvgText,
} from 'react-native-svg';

interface ChartConfig {
  width?: number;
  height?: number;
  padding?: number;
  showGrid?: boolean;
  showLabels?: boolean;
  animated?: boolean;
  duration?: number;
  gradient?: boolean;
  interactive?: boolean;
  showYLabels?: boolean;
  yLabelCount?: number;
  yAxisWidth?: number;
  /** Antall x-merker jevnt fordelt langs aksen (standard 5) */
  xTickCount?: number;
  /**
   * Fast x-akse i millisekunder (epoch), f.eks. [nå − 12 uker, nå].
   * Da vises hele tidsvinduet selv om første måling kommer senere (tomt til venstre/høyre).
   */
  xDomain?: { min: number; max: number };
}

export type ChartDataPoint = {
  x: string | number;
  y: number;
  label?: string;
};

export type ChartLineSeries = {
  id?: string;
  label?: string;
  color?: string;
  data: ChartDataPoint[];
};

const AnimatedPath = Animated.createAnimatedComponent(SvgPath);

// Utility functions
const createPath = (points: { x: number; y: number }[]): string => {
  if (points.length === 0) return '';

  let path = `M${points[0].x},${points[0].y}`;

  for (let i = 1; i < points.length; i++) {
    const prevPoint = points[i - 1];
    const currentPoint = points[i];

    const cpx = (prevPoint.x + currentPoint.x) / 2;
    const cpy = prevPoint.y;

    path += ` Q${cpx},${cpy} ${currentPoint.x},${currentPoint.y}`;
  }

  return path;
};

const createAreaPath = (
  points: { x: number; y: number }[],
  height: number
): string => {
  if (points.length === 0) return '';

  let path = createPath(points);
  const lastPoint = points[points.length - 1];
  const firstPoint = points[0];

  path += ` L${lastPoint.x},${height} L${firstPoint.x},${height} Z`;

  return path;
};

/** Grov lengde for stroke-dash “tegne”-animasjon (Bezier ≈ litt lenger enn polylinje). */
const estimatePathDrawLength = (pts: { x: number; y: number }[]): number => {
  if (pts.length < 2) return 1;
  let len = 0;
  for (let i = 1; i < pts.length; i++) {
    len += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
  }
  return Math.max(len * 1.18, 8);
};

const formatNumber = (num: number): string => {
  if (num >= 1000000) {
    return (num / 1000000).toFixed(1) + 'M';
  } else if (num >= 1000) {
    return (num / 1000).toFixed(1) + 'K';
  }
  return num.toFixed(0);
};

const formatKr = (num: number): string => `${formatNumber(num)} kr`;

const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

const DEFAULT_X_TICK_COUNT = 5;

/** Fem (eller `count`) punkt jevnt fordelt langs x i piksler, med label fra domenet (tid eller indeks). */
function buildEvenlySpacedXTicks(
  count: number,
  leftPadding: number,
  innerChartWidth: number,
  useNumericX: boolean,
  minX: number,
  xRange: number,
  baseData: ChartDataPoint[]
): { xCoord: number; label: string; key: string }[] {
  const n = clamp(Math.round(count), 2, 12);
  const steps = n - 1;
  const ticks: { xCoord: number; label: string; key: string }[] = [];

  for (let i = 0; i < n; i++) {
    const ratio = steps > 0 ? i / steps : 0;
    const xCoord = leftPadding + ratio * innerChartWidth;

    if (useNumericX) {
      const t = minX + ratio * xRange;
      ticks.push({
        xCoord,
        label: new Date(t).toLocaleDateString('nb-NO', { day: '2-digit', month: '2-digit' }),
        key: `x-even-num-${i}-${Math.round(t)}`,
      });
    } else {
      const len = Math.max(1, baseData.length - 1);
      const idx = Math.round(ratio * len);
      const pt = baseData[idx];
      const label =
        (typeof pt?.label === 'string' && pt.label) || (pt?.x != null ? String(pt.x) : '');
      ticks.push({
        xCoord,
        label,
        key: `x-even-idx-${i}-${idx}`,
      });
    }
  }

  return ticks;
}

type ChartMeta = {
  chartWidth: number;
  padding: number;
  leftPadding: number;
  innerChartWidth: number;
  height: number;
  minX: number;
  xRange: number;
  useNumericX: boolean;
  nonEmpty: ChartLineSeries[];
  seriesPoints: Array<{
    color: string;
    _points: { x: number; y: number }[];
    _path: string;
    _areaPath: string;
  }>;
};

type InteractionState = {
  x: number;
  dateLabel: string;
  items: { label: string; color: string; value: string }[];
};

type Props = {
  data?: ChartDataPoint[];
  series?: ChartLineSeries[];
  config?: ChartConfig;
  style?: ViewStyle;
};

function AnimatedLinePath({
  d,
  color,
  pathLength,
  progress,
  enabled,
}: {
  d: string;
  color: string;
  pathLength: number;
  progress: SharedValue<number>;
  enabled: boolean;
}) {
  const dash = `${pathLength} ${pathLength}`;
  const animatedProps = useAnimatedProps(() => ({
    strokeDashoffset: enabled ? pathLength * (1 - progress.value) : 0,
  }));

  if (!enabled) {
    return (
      <SvgPath
        d={d}
        stroke={color}
        strokeWidth={2}
        fill='none'
        strokeLinecap='round'
        strokeLinejoin='round'
      />
    );
  }

  return (
    <AnimatedPath
      animatedProps={animatedProps}
      d={d}
      stroke={color}
      strokeWidth={2}
      fill='none'
      strokeLinecap='round'
      strokeLinejoin='round'
      strokeDasharray={dash}
    />
  );
}

AnimatedLinePath.displayName = 'AnimatedLinePath';

export const LineChart = ({ data = [], series, config = {}, style }: Props) => {
  const [containerWidth, setContainerWidth] = useState(300);
  const [interaction, setInteraction] = useState<InteractionState | null>(null);

  const {
    height = 200,
    padding = 20,
    showGrid = true,
    showLabels = true,
    gradient = false,
    interactive = false,
    animated = false,
    duration = 600,
    showYLabels = true,
    yLabelCount = 5,
    yAxisWidth = 20,
    xTickCount = DEFAULT_X_TICK_COUNT,
    xDomain: xDomainConfig,
  } = config;

  const chartWidth = containerWidth || config.width || 300;

  const primaryColor = useColor('primary');
  /** Fallback: SVG-stroke uten farge = usynlig grid */
  const axisMuted = useColor('mutedForeground') ?? '#9CA3AF';
  const gridStroke = axisMuted;

  const drawProgress = useSharedValue(animated ? 0 : 1);

  const handleLayout = (event: LayoutChangeEvent) => {
    const { width: measuredWidth } = event.nativeEvent.layout;
    if (measuredWidth > 0) {
      setContainerWidth(measuredWidth);
    }
  };

  const datasets: ChartLineSeries[] = series?.length
    ? series
    : [
        {
          id: 'default',
          color: primaryColor,
          data,
        },
      ];

  const nonEmpty = datasets.filter((s) => (s.data?.length ?? 0) > 0);
  const hasData = nonEmpty.length > 0;

  const animKey = useMemo(
    () =>
      `${chartWidth}|${nonEmpty.map((s) => `${s.id ?? ''}:${s.data.length}:${s.data[0]?.y ?? ''}`).join(';')}`,
    [chartWidth, nonEmpty]
  );

  useEffect(() => {
    if (!hasData) {
      drawProgress.value = 1;
      return;
    }
    if (!animated) {
      drawProgress.value = 1;
      return;
    }
    drawProgress.value = 0;
    drawProgress.value = withTiming(1, {
      duration,
      easing: Easing.out(Easing.cubic),
    });
  }, [animated, duration, animKey, drawProgress, hasData]);

  const chartOpacityStyle = useAnimatedStyle(() => ({
    opacity: animated ? 0.2 + 0.8 * drawProgress.value : 1,
  }));

  const metaRef = useRef<ChartMeta | null>(null);

  const clearInteraction = useCallback(() => {
    setInteraction(null);
  }, []);

  const handlePointer = useCallback((x: number) => {
    const m = metaRef.current;
    if (!m || m.innerChartWidth <= 0) return;

    const xClamped = clamp(x, m.leftPadding, m.chartWidth - m.padding);
    const items: InteractionState['items'] = [];
    let dateLabel = '';

    if (m.useNumericX) {
      const t = m.minX + ((xClamped - m.leftPadding) / m.innerChartWidth) * m.xRange;
      dateLabel = new Date(t).toLocaleDateString('nb-NO', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });

      for (let si = 0; si < m.nonEmpty.length; si++) {
        const s = m.nonEmpty[si];
        let bestI = 0;
        let bestD = Infinity;
        for (let i = 0; i < s.data.length; i++) {
          const dx = s.data[i].x;
          if (typeof dx !== 'number' || !Number.isFinite(dx)) continue;
          const dAbs = Math.abs(dx - t);
          if (dAbs < bestD) {
            bestD = dAbs;
            bestI = i;
          }
        }
        const pt = s.data[bestI];
        const col = m.seriesPoints[si]?.color ?? '#2563EB';
        items.push({
          label: s.label ?? 'Butikk',
          color: col,
          value: `${Number(pt.y).toFixed(2)} kr`,
        });
      }
    } else {
      const pts0 = m.seriesPoints[0]?._points ?? [];
      if (!pts0.length) return;
      let bestIdx = 0;
      let bd = Infinity;
      for (let i = 0; i < pts0.length; i++) {
        const d0 = Math.abs(pts0[i].x - xClamped);
        if (d0 < bd) {
          bd = d0;
          bestIdx = i;
        }
      }
      const base = m.nonEmpty[0].data[bestIdx];
      dateLabel =
        (typeof base?.label === 'string' && base.label) ||
        (base?.x != null ? String(base.x) : '');

      for (let si = 0; si < m.nonEmpty.length; si++) {
        const s = m.nonEmpty[si];
        const idx = Math.min(bestIdx, Math.max(0, s.data.length - 1));
        const pt = s.data[idx];
        const col = m.seriesPoints[si]?.color ?? '#2563EB';
        items.push({
          label: s.label ?? 'Butikk',
          color: col,
          value: `${Number(pt.y).toFixed(2)} kr`,
        });
      }
    }

    setInteraction({ x: xClamped, dateLabel, items });
  }, []);

  const panGesture = Gesture.Pan()
    .enabled(interactive)
    .onStart((e) => {
      if (interactive) runOnJS(handlePointer)(e.x);
    })
    .onUpdate((e) => {
      if (interactive) runOnJS(handlePointer)(e.x);
    })
    .onEnd(() => {
      if (interactive) runOnJS(clearInteraction)();
    })
    .onFinalize(() => {
      if (interactive) runOnJS(clearInteraction)();
    });

  if (!hasData) return null;

  const allY = nonEmpty.flatMap((s) => s.data.map((d) => d.y));
  const maxValue = Math.max(...allY);
  const minValue = Math.min(...allY);
  const valueRange = maxValue - minValue || 1;

  const leftPadding = showYLabels ? padding + yAxisWidth : padding;
  const innerChartWidth = chartWidth - leftPadding - padding;
  const chartHeight = height - padding * 2;

  const allXNumeric = nonEmpty
    .flatMap((s) => s.data.map((d) => d.x))
    .filter((x): x is number => typeof x === 'number' && Number.isFinite(x));

  const useNumericX = allXNumeric.length > 0;

  const domainFromConfig =
    xDomainConfig &&
    Number.isFinite(xDomainConfig.min) &&
    Number.isFinite(xDomainConfig.max) &&
    xDomainConfig.max > xDomainConfig.min;

  let minX: number;
  let maxX: number;
  if (useNumericX && domainFromConfig) {
    minX = xDomainConfig!.min;
    maxX = xDomainConfig!.max;
  } else if (useNumericX) {
    minX = Math.min(...allXNumeric);
    maxX = Math.max(...allXNumeric);
  } else {
    minX = 0;
    maxX = 1;
  }
  const xRange = maxX - minX || 1;

  const plotRight = leftPadding + innerChartWidth;

  const seriesPoints = nonEmpty.map((s) => {
    const pts = s.data.map((point, index) => {
      let xCoord: number;
      if (useNumericX && typeof point.x === 'number' && Number.isFinite(point.x)) {
        const raw = leftPadding + ((point.x - minX) / xRange) * innerChartWidth;
        xCoord = clamp(raw, leftPadding, plotRight);
      } else {
        xCoord = leftPadding + (index / Math.max(1, s.data.length - 1)) * innerChartWidth;
      }

      const yCoord = padding + ((maxValue - point.y) / valueRange) * chartHeight;
      return { x: xCoord, y: yCoord };
    });
    return {
      ...s,
      color: s.color ?? primaryColor,
      _points: pts,
      _path: createPath(pts),
      _areaPath: gradient ? createAreaPath(pts, height - padding) : '',
    };
  });

  metaRef.current = {
    chartWidth,
    padding,
    leftPadding,
    innerChartWidth,
    height,
    minX,
    xRange,
    useNumericX,
    nonEmpty,
    seriesPoints,
  };

  const yAxisLabels: { value: number; y: number }[] = [];
  if (showYLabels) {
    for (let i = 0; i < yLabelCount; i++) {
      const ratio = i / (yLabelCount - 1);
      const value = maxValue - ratio * valueRange;
      const y = padding + ratio * chartHeight;
      yAxisLabels.push({ value, y });
    }
  }

  const baseSeriesData = nonEmpty[0]?.data ?? [];
  const evenXAxisTicks = buildEvenlySpacedXTicks(
    xTickCount,
    leftPadding,
    innerChartWidth,
    useNumericX,
    minX,
    xRange,
    baseSeriesData
  );

  const verticalGridXCoords = showGrid ? evenXAxisTicks.map((t) => t.xCoord) : [];

  const chartSvg = (
    <Animated.View style={chartOpacityStyle}>
      <Svg width={chartWidth} height={height}>
        <Defs>
          {gradient &&
            seriesPoints.map((s, idx) => (
              <LinearGradient
                // eslint-disable-next-line react/no-array-index-key
                key={`gradient-${s.id ?? idx}`}
                id={`gradient-${s.id ?? idx}`}
                x1='0%'
                y1='0%'
                x2='0%'
                y2='100%'
              >
                <Stop offset='0%' stopColor={s.color} stopOpacity='0.25' />
                <Stop offset='100%' stopColor={s.color} stopOpacity='0.05' />
              </LinearGradient>
            ))}
        </Defs>

        {showYLabels && (
          <G>
            {yAxisLabels.map((label, index) => (
              <SvgText
                key={`y-label-${index}`}
                x={leftPadding - 10}
                y={label.y + 4}
                textAnchor='end'
                fontSize={10}
                fill={axisMuted}
              >
                {formatKr(label.value)}
              </SvgText>
            ))}
          </G>
        )}

        {showGrid && (
          <G>
            {yAxisLabels.map((label, index) => (
              <Line
                key={`grid-h-${index}`}
                x1={leftPadding}
                y1={label.y}
                x2={chartWidth - padding}
                y2={label.y}
                stroke={gridStroke}
                strokeWidth={1}
                opacity={0.55}
              />
            ))}
            {verticalGridXCoords.map((gx, index) => (
              <Line
                key={`grid-v-${index}`}
                x1={gx}
                y1={padding}
                x2={gx}
                y2={height - padding}
                stroke={gridStroke}
                strokeWidth={1}
                opacity={0.45}
              />
            ))}
          </G>
        )}

        {gradient &&
          seriesPoints.map((s, idx) => (
            <SvgPath
              // eslint-disable-next-line react/no-array-index-key
              key={`area-${s.id ?? idx}`}
              d={s._areaPath}
              fill={`url(#gradient-${s.id ?? idx})`}
              opacity={animated ? undefined : 1}
            />
          ))}

        {seriesPoints.map((s, idx) => {
          const len = estimatePathDrawLength(s._points);
          return (
            <AnimatedLinePath
              // eslint-disable-next-line react/no-array-index-key
              key={`line-${s.id ?? idx}`}
              d={s._path}
              color={s.color}
              pathLength={len}
              progress={drawProgress}
              enabled={animated}
            />
          );
        })}

        {seriesPoints.map((s, sIdx) =>
          s._points.map((p, index) => (
            <SvgCircle
              // eslint-disable-next-line react/no-array-index-key
              key={`point-${s.id ?? sIdx}-${index}`}
              cx={p.x}
              cy={p.y}
              r={3}
              fill={s.color}
              opacity={0.9}
            />
          ))
        )}

        {interactive && interaction && (
          <G pointerEvents='none'>
            <Line
              x1={interaction.x}
              y1={padding}
              x2={interaction.x}
              y2={height - padding}
              stroke={axisMuted}
              strokeWidth={1}
              opacity={0.85}
            />
            {seriesPoints.map((s, si) => {
              const pts = s._points;
              if (!pts.length) return null;
              let best = 0;
              let bd = Infinity;
              for (let i = 0; i < pts.length; i++) {
                const d = Math.abs(pts[i].x - interaction.x);
                if (d < bd) {
                  bd = d;
                  best = i;
                }
              }
              const p = pts[best];
              return (
                <SvgCircle
                  key={`cross-${s.id ?? si}`}
                  cx={p.x}
                  cy={p.y}
                  r={5}
                  fill={s.color}
                  stroke='#fff'
                  strokeWidth={1.5}
                  opacity={0.95}
                />
              );
            })}
          </G>
        )}

        {showLabels && (
          <G>
            {evenXAxisTicks.map((tick) => (
              <SvgText
                key={tick.key}
                x={tick.xCoord}
                y={height - 5}
                textAnchor='middle'
                fontSize={10}
                fill={axisMuted}
              >
                {tick.label}
              </SvgText>
            ))}
          </G>
        )}
      </Svg>
    </Animated.View>
  );

  const wrappedChart = interactive ? (
    <GestureDetector gesture={panGesture}>{chartSvg}</GestureDetector>
  ) : (
    chartSvg
  );

  return (
    <View style={[{ width: '100%', height }, style]} onLayout={handleLayout}>
      <View style={styles.chartStack}>
        {wrappedChart}
        {interactive && interaction && (
          <View pointerEvents='none' style={styles.tooltipWrap}>
            <View
              style={[
                styles.tooltip,
                {
                  left: clamp(interaction.x - 72, 4, chartWidth - 148),
                  top: padding + 4,
                },
              ]}
            >
              <Text style={styles.tooltipDate}>{interaction.dateLabel}</Text>
              {interaction.items.map((it, i) => (
                <View key={`tt-${it.label}-${i}`} style={styles.tooltipRow}>
                  <View style={[styles.dot, { backgroundColor: it.color }]} />
                  <Text style={styles.tooltipLabel} numberOfLines={1}>
                    {it.label}
                  </Text>
                  <Text style={styles.tooltipValue}>{it.value}</Text>
                </View>
              ))}
            </View>
          </View>
        )}
      </View>
    </View>
  );
};

LineChart.displayName = 'LineChart';

const styles = StyleSheet.create({
  chartStack: {
    position: 'relative',
    width: '100%',
  },
  tooltipWrap: {
    ...StyleSheet.absoluteFillObject,
  },
  tooltip: {
    position: 'absolute',
    minWidth: 140,
    maxWidth: 200,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(17, 24, 39, 0.92)',
  },
  tooltipDate: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '700',
    marginBottom: 6,
  },
  tooltipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tooltipLabel: {
    flex: 1,
    color: '#E5E7EB',
    fontSize: 10,
  },
  tooltipValue: {
    color: '#F9FAFB',
    fontSize: 11,
    fontWeight: '700',
  },
});

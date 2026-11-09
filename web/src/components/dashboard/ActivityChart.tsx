import { useMemo } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Activity } from 'lucide-react';
import type { CaseType } from '@/api/types';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/Card';
import { caseTypeColor, caseTypeLabel } from '@/lib/cases';
import { formatNumber } from '@/lib/format';

interface ActivityChartProps {
  data: Array<{ type: CaseType; count: number }>;
}

interface ChartDatum {
  key: string;
  type: CaseType | 'other';
  label: string;
  count: number;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ChartDatum }>;
}

interface ActivityTickProps {
  x?: number;
  y?: number;
  payload?: { value?: string | number };
  data: ChartDatum[];
}

/** Ось Y с цветным счётчиком справа от названия типа — цифры не режутся clip-path */
function ActivityTick({ x = 0, y = 0, payload, data }: ActivityTickProps) {
  const value = String(payload?.value ?? '');
  const datum = data.find((item) => item.label === value);

  return (
    <g transform={`translate(${x},${y})`}>
      <text x={-8} y={0} dy={4} textAnchor="end" fill="#aeb3cc" fontSize={10}>
        {value}
        {datum ? (
          <tspan dx={6} fill={datum.color} fontSize={10} fontWeight={700}>
            {formatNumber(datum.count)}
          </tspan>
        ) : null}
      </text>
    </g>
  );
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const datum = payload?.[0]?.payload;
  if (!active || !datum) return null;

  return (
    <div className="glass-modal min-w-[160px] border-white/[0.08] px-3.5 py-3 shadow-modal">
      <div className="flex items-center gap-2">
        <span
          className="h-2 w-2 rounded-full"
          style={{ backgroundColor: datum.color, boxShadow: `0 0 8px ${datum.color}` }}
        />
        <span className="text-xs font-medium text-muted-foreground">{datum.label}</span>
      </div>
      <p className="mt-1.5 font-mono text-xl font-semibold tabular-nums text-foreground">
        {formatNumber(datum.count)}
      </p>
      <p className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">
        активных наказаний
      </p>
    </div>
  );
}

/**
 * Горизонтальный bar-chart выбран специально: русские названия типов
 * длинные, и вертикальные столбики на мобильных превращаются в кашу.
 */
export function ActivityChart({ data }: ActivityChartProps) {
  const chartData = useMemo<ChartDatum[]>(() => {
    const top: ChartDatum[] = data.slice(0, 7).map((item) => ({
      key: item.type,
      type: item.type,
      label: caseTypeLabel(item.type),
      count: item.count,
      color: caseTypeColor(item.type),
    }));

    const rest = data.slice(7);
    const restCount = rest.reduce((sum, item) => sum + item.count, 0);
    if (restCount > 0) {
      top.push({
        key: 'other',
        type: 'other',
        label: 'Другие',
        count: restCount,
        color: '#565c78',
      });
    }

    return top;
  }, [data]);

  const total = useMemo(() => data.reduce((sum, item) => sum + item.count, 0), [data]);
  const ariaLabel = chartData.length
    ? `Активные наказания по типам: ${chartData.map((item) => `${item.label} — ${item.count}`).join(', ')}`
    : 'Активных наказаний нет';

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex-row items-start justify-between gap-3 space-y-0 pb-3">
        <div>
          <CardTitle className="text-[15px]">Активные наказания</CardTitle>
          <CardDescription className="mt-1">Распределение по типам</CardDescription>
        </div>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-white/[0.07] bg-white/[0.035] px-2.5 py-1 text-[10px] font-semibold text-muted-foreground">
          <span className="h-1.5 w-1.5 rounded-full bg-accent shadow-[0_0_6px_rgba(102,115,255,0.8)]" />
          {formatNumber(total)} активных
        </span>
      </CardHeader>

      <CardContent className="pt-1">
        {chartData.length === 0 ? (
          <div className="flex h-[300px] flex-col items-center justify-center text-center">
            <div className="mb-4 grid h-14 w-14 place-items-center rounded-2xl border border-accent/15 bg-accent/[0.07] text-accent">
              <Activity className="h-6 w-6" strokeWidth={1.7} />
            </div>
            <p className="text-sm font-semibold">Активных наказаний нет</p>
            <p className="mt-1.5 max-w-xs text-xs leading-relaxed text-muted-foreground">
              Когда модерация начнёт выдавать баны, муты или таймауты, здесь появится
              распределение по типам.
            </p>
          </div>
        ) : (
          <div className="h-[300px] w-full" role="img" aria-label={ariaLabel}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={chartData}
                layout="vertical"
                margin={{ top: 4, right: 20, left: 0, bottom: 4 }}
                barCategoryGap={10}
              >
                <CartesianGrid
                  horizontal={false}
                  stroke="rgba(255,255,255,0.055)"
                  strokeDasharray="4 4"
                />
                <XAxis type="number" hide />
                <YAxis
                  type="category"
                  dataKey="label"
                  axisLine={false}
                  tickLine={false}
                  width={128}
                  tick={<ActivityTick data={chartData} />}
                />
                <Tooltip
                  cursor={{ fill: 'rgba(255,255,255,0.03)' }}
                  content={<ChartTooltip />}
                  wrapperStyle={{ outline: 'none' }}
                />
                <Bar
                  dataKey="count"
                  name="Активных"
                  radius={[0, 8, 8, 0]}
                  barSize={18}
                  background={{ fill: 'rgba(255,255,255,0.025)' }}
                  animationDuration={900}
                  animationEasing="ease-out"
                >
                  {chartData.map((item) => (
                    <Cell key={item.key} fill={item.color} fillOpacity={0.9} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

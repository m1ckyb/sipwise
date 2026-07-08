import { memo, useMemo } from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import type { TooltipContentProps } from 'recharts';
import { generateBACGraphData } from '../utils/bac';
import type { Drink, Profile } from '../utils/bac';

interface BACGraphProps {
  drinks: Drink[];
  profile: Profile;
  now: number;
  showNowLine?: boolean;
  title?: string;
  minimal?: boolean;
}

const CustomTooltip = ({ active, payload, unit }: Partial<TooltipContentProps<number, string>> & { unit: '%' | '‰' }) => {
  if (active && payload && payload.length && payload[0].value !== undefined) {
    return (
      <div className="custom-tooltip">
        <p className="label">{payload[0].payload.label}</p>
        <p className="bac">{Number(payload[0].value).toFixed(unit === '‰' ? 2 : 3)}{unit} BAC</p>
      </div>
    );
  }
  return null;
};

const MemoizedTooltip = memo(CustomTooltip);

const BACGraph = memo(function BACGraph({ drinks, profile, now, showNowLine = true, title = "BAC Timeline", minimal = false }: BACGraphProps) {
  const rawData = useMemo(() => generateBACGraphData(drinks, profile, now), [drinks, profile, now]);
  const factor = profile.displayUnit === '‰' ? 10 : 1;
  const data = useMemo(() => rawData.map(d => ({ ...d, bac: d.bac * factor })), [rawData, factor]);

  if (data.length === 0) {
    return (
      <div className={minimal ? "graph-container minimal empty-graph" : "card graph-card empty-graph"}>
        <p>No drink data to display</p>
      </div>
    );
  }

  return (
    <div className={minimal ? "graph-container minimal" : "card graph-card"}>
      <span className="label">{title}</span>
      <div style={{ width: '100%', height: minimal ? 150 : 200, marginTop: minimal ? '0.5rem' : '1rem' }}>
        <ResponsiveContainer>
          <AreaChart data={data}>
            <defs>
              <linearGradient id="colorBac" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.8}/>
                <stop offset="95%" stopColor="var(--primary)" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#444" />
            <XAxis 
              dataKey="label" 
              fontSize={minimal ? 8 : 10} 
              tick={{ fill: '#888' }}
              interval="preserveStartEnd"
              minTickGap={minimal ? 40 : 30}
            />
            <YAxis 
              fontSize={minimal ? 8 : 10} 
              tick={{ fill: '#888' }}
              tickFormatter={(val) => val.toFixed(2)}
              domain={[0, (dataMax: number) => Math.max(0.1 * factor, dataMax + (0.01 * factor))]}
              width={minimal ? 30 : 35}
            />
            <Tooltip content={<MemoizedTooltip unit={profile.displayUnit} />} />
            {showNowLine && <ReferenceLine x="Now" stroke="var(--secondary)" strokeDasharray="3 3" />}
            <Area 
              type="monotone" 
              dataKey="bac" 
              stroke="var(--primary)" 
              fillOpacity={1} 
              fill="url(#colorBac)" 
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
});

export default BACGraph;

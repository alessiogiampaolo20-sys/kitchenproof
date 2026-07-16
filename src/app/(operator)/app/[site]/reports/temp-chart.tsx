"use client";

import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export type TempPoint = { at: string; label: string; temp: number };

export function TempChart({
  points,
  limitMax,
  limitMin,
}: {
  points: TempPoint[];
  limitMax?: number;
  limitMin?: number;
}) {
  return (
    <div className="h-64 w-full" data-testid="temp-chart">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -16 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
          <XAxis dataKey="label" fontSize={12} tickLine={false} />
          <YAxis fontSize={12} tickLine={false} unit="°" />
          <Tooltip
            formatter={(value) => [`${value} °C`]}
            labelFormatter={(label) => String(label)}
          />
          {limitMax !== undefined ? (
            <ReferenceLine y={limitMax} stroke="var(--destructive)" strokeDasharray="4 4" />
          ) : null}
          {limitMin !== undefined ? (
            <ReferenceLine y={limitMin} stroke="var(--destructive)" strokeDasharray="4 4" />
          ) : null}
          <Line
            type="monotone"
            dataKey="temp"
            stroke="var(--primary)"
            strokeWidth={2}
            dot={{ r: 3 }}
            isAnimationActive={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

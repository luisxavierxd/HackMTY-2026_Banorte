import type { ChartAdapter, ChartTone, EChartsOption } from "../types";
import { toneColor } from "../lib/tone";
import { animationConfig } from "../lib/motion";

export interface ProgressRingProps {
  label: string;
  value?: number;
  target: number;
  caption?: string;
  tone?: ChartTone;
}

export const progressRing: ChartAdapter<ProgressRingProps> = {
  name: "ProgressRing",
  height: 200,
  isEmpty(props) {
    return !props.target || props.target <= 0;
  },
  toOption(props, _data, ctx): EChartsOption {
    const value = Number(props.value ?? 0);
    const target = Number(props.target) || 1;
    const pct = Math.max(0, Math.min(1, value / target));
    const color = toneColor(props.tone ?? "ahorro", ctx.t);
    const anim = animationConfig(ctx);
    const pctLabel = new Intl.NumberFormat("es-MX", { style: "percent", maximumFractionDigits: 0 }).format(pct);

    return {
      series: [
        {
          type: "pie",
          radius: ["76%", "90%"],
          center: ["50%", "38%"],
          startAngle: 90,
          silent: true,
          label: { show: false },
          itemStyle: { borderRadius: 10 },
          data: [
            { value: pct, itemStyle: { color } },
            { value: Math.max(0, 1 - pct), itemStyle: { color: ctx.t.line } },
          ],
          ...anim,
        },
      ],
      graphic: [
        {
          type: "text",
          left: "center",
          top: "34%",
          style: {
            text: pctLabel,
            fontSize: 26,
            fontWeight: 700,
            fill: ctx.t.ink,
            fontFamily: "Bricolage Grotesque, system-ui, sans-serif",
          },
        },
        {
          type: "text",
          left: "center",
          top: "72%",
          style: { text: props.label, fontSize: 13, fontWeight: 600, fill: ctx.t.ink },
        },
        ...(props.caption
          ? [
              {
                type: "text",
                left: "center",
                top: "88%",
                style: { text: props.caption, fontSize: 12, fill: ctx.t.mute },
              },
            ]
          : []),
      ],
    };
  },
};

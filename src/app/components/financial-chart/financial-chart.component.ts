import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { RevenueBucket } from '@shared/core/finance/financial-analytics';
import { formatPhp } from '@shared/core/format/format';

export type FinancialChartType = 'horizontal' | 'bar' | 'line';

interface ChartPoint {
  key: string;
  label: string;
  revenue: number;
  paidOrderCount: number;
  x: number;
  y: number;
  showLabel: boolean;
  tooltip: string;
}

interface ChartBar extends ChartPoint {
  width: number;
  height: number;
}

interface ChartTick {
  ratio: number;
  y: number;
  label: string;
}

@Component({
  selector: 'admin-financial-chart',
  templateUrl: './financial-chart.component.html',
  styleUrl: './financial-chart.component.scss',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class FinancialChartComponent {
  readonly type = input.required<FinancialChartType>();
  readonly buckets = input.required<readonly RevenueBucket[]>();

  readonly formatMoney = formatPhp;

  private readonly chartWidth = 760;
  private readonly chartHeight = 280;
  readonly plotLeft = 78;
  private readonly plotTop = 18;
  readonly plotWidth = 660;
  private readonly plotHeight = 214;

  readonly maxRevenue = computed(() =>
    Math.max(0, ...this.buckets().map((bucket) => bucket.revenue))
  );

  readonly hasData = computed(() =>
    this.buckets().some((bucket) => bucket.revenue > 0)
  );

  readonly chartDescription = computed(() => {
    const count = this.buckets().length;
    const kind = this.type() === 'line' ? 'Line chart' : 'Bar chart';
    return `${kind} of collected revenue across ${count} ${
      count === 1 ? 'period' : 'periods'
    }.`;
  });

  readonly yTicks = computed<ChartTick[]>(() => {
    const max = this.maxRevenue();
    return [1, 0.5, 0].map((ratio) => ({
      ratio,
      y: this.plotTop + this.plotHeight - ratio * this.plotHeight,
      label: this.formatMoney(max * ratio),
    }));
  });

  readonly bars = computed<ChartBar[]>(() => {
    const items = this.buckets();
    if (items.length === 0) {
      return [];
    }
    const max = this.maxRevenue();
    const slotWidth = this.plotWidth / items.length;
    const barWidth = Math.max(2, Math.min(42, slotWidth * 0.62));

    return items.map((bucket, index) => {
      const height =
        max > 0 ? (bucket.revenue / max) * this.plotHeight : 0;
      return {
        key: bucket.key,
        label: bucket.label,
        revenue: bucket.revenue,
        paidOrderCount: bucket.paidOrderCount,
        x:
          this.plotLeft +
          index * slotWidth +
          (slotWidth - barWidth) / 2,
        y: this.plotTop + this.plotHeight - height,
        width: barWidth,
        height,
        showLabel: this.showLabel(index, items.length),
        tooltip: this.tooltip(bucket),
      };
    });
  });

  readonly points = computed<ChartPoint[]>(() => {
    const items = this.buckets();
    if (items.length === 0) {
      return [];
    }
    const max = this.maxRevenue();
    const step = items.length > 1 ? this.plotWidth / (items.length - 1) : 0;

    return items.map((bucket, index) => {
      const height =
        max > 0 ? (bucket.revenue / max) * this.plotHeight : 0;
      return {
        key: bucket.key,
        label: bucket.label,
        revenue: bucket.revenue,
        paidOrderCount: bucket.paidOrderCount,
        x:
          items.length === 1
            ? this.plotLeft + this.plotWidth / 2
            : this.plotLeft + index * step,
        y: this.plotTop + this.plotHeight - height,
        showLabel: this.showLabel(index, items.length),
        tooltip: this.tooltip(bucket),
      };
    });
  });

  readonly linePoints = computed(() =>
    this.points()
      .map((point) => `${point.x},${point.y}`)
      .join(' ')
  );

  readonly areaPath = computed(() => {
    const points = this.points();
    if (points.length < 2) {
      return '';
    }
    const baseline = this.plotTop + this.plotHeight;
    return `M ${points[0].x} ${baseline} L ${points
      .map((point) => `${point.x} ${point.y}`)
      .join(' L ')} L ${points[points.length - 1].x} ${baseline} Z`;
  });

  get chartViewBox(): string {
    return `0 0 ${this.chartWidth} ${this.chartHeight}`;
  }

  get labelY(): number {
    return this.plotTop + this.plotHeight + 22;
  }

  breakdownShare(bucket: RevenueBucket): number {
    const max = this.maxRevenue();
    return max > 0 ? (bucket.revenue / max) * 100 : 0;
  }

  private showLabel(index: number, count: number): boolean {
    const maxLabels = 12;
    if (count <= maxLabels) {
      return true;
    }
    const step = Math.ceil(count / maxLabels);
    return index % step === 0 || index === count - 1;
  }

  private tooltip(bucket: RevenueBucket): string {
    const orders = bucket.paidOrderCount;
    return `${bucket.label}: ${this.formatMoney(bucket.revenue)} · ${orders} ${
      orders === 1 ? 'order' : 'orders'
    }`;
  }
}

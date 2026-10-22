import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { BehaviorSubject, Subject } from 'rxjs';
import { Order } from '@shared/models/order.model';
import { Product } from '@shared/models/product.model';
import { OrdersService } from '@shared/services/orders.service';
import { ProductsService } from '@shared/services/products.service';
import { AdminDashboardPage } from './admin-dashboard.page';

function makeOrder(
  id: string,
  total: number,
  paidAt: Date,
  overrides: Partial<Order> = {}
): Order {
  return {
    id,
    customerId: 'uid-1',
    customerSnapshot: null,
    addressSnapshot: null,
    items: [],
    subtotal: Math.max(0, total - 17),
    deliveryFee: 17,
    total,
    customerComment: '',
    paymentMethod: 'GCASH',
    paymentStatus: 'PAID',
    gcashDetails: null,
    paymentDecision: {
      decision: 'PAID',
      decidedBy: 'admin-1',
      decidedAt: paidAt.toISOString(),
    },
    orderStatus: 'COMPLETED',
    createdAt: paidAt.toISOString(),
    updatedAt: paidAt.toISOString(),
    ...overrides,
  };
}

const OCTOBER_ORDERS: Order[] = [
  makeOrder('order-1', 100, new Date(2026, 9, 2, 12, 0, 0)),
  makeOrder('order-2', 200, new Date(2026, 9, 15, 12, 0, 0)),
  makeOrder(
    'order-cancelled',
    900,
    new Date(2026, 9, 16, 12, 0, 0),
    { orderStatus: 'CANCELLED' }
  ),
  makeOrder(
    'order-unpaid',
    800,
    new Date(2026, 9, 17, 12, 0, 0),
    { paymentStatus: 'VERIFYING', paymentDecision: null }
  ),
];

describe('AdminDashboardPage financial chart types', () => {
  let fixture: ComponentFixture<AdminDashboardPage>;
  let page: AdminDashboardPage;
  let ordersSubject: BehaviorSubject<Order[]>;

  function query(selector: string): HTMLElement | null {
    return fixture.nativeElement.querySelector(selector) as HTMLElement | null;
  }

  function queryAll(selector: string): HTMLElement[] {
    return Array.from(
      fixture.nativeElement.querySelectorAll(selector)
    ) as HTMLElement[];
  }

  function chartTypeButton(label: string): HTMLButtonElement {
    const button = queryAll('.chart-type-tab').find(
      (item) => item.textContent?.trim() === label
    );
    if (!button) {
      throw new Error(`Expected a ${label} chart option.`);
    }
    return button as HTMLButtonElement;
  }

  function selectChartType(label: string): void {
    chartTypeButton(label).click();
    fixture.detectChanges();
  }

  beforeEach(() => {
    ordersSubject = new BehaviorSubject<Order[]>(OCTOBER_ORDERS);
    const productsSubject = new BehaviorSubject<Product[]>([]);

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ProductsService,
          useValue: { watchProducts: () => productsSubject.asObservable() },
        },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
      ],
    });

    fixture = TestBed.createComponent(AdminDashboardPage);
    page = fixture.componentInstance;
    page.financialAnchor.set(new Date(2026, 9, 1));
    fixture.detectChanges();
  });

  afterEach(() => {
    fixture?.destroy();
  });

  it('selects the horizontal bar chart by default', () => {
    expect(page.financialChartType()).toBe('horizontal');
    expect(query('.breakdown-list')).not.toBeNull();
    expect(query('.chart-bar')).toBeNull();
    expect(query('.chart-line')).toBeNull();
    expect(
      chartTypeButton('Horizontal bars').getAttribute('aria-pressed')
    ).toBe('true');
    expect(chartTypeButton('Bar').getAttribute('aria-pressed')).toBe('false');
    expect(chartTypeButton('Line').getAttribute('aria-pressed')).toBe('false');
  });

  it('renders the bar chart when Bar is selected', () => {
    selectChartType('Bar');

    expect(page.financialChartType()).toBe('bar');
    expect(query('.breakdown-list')).toBeNull();
    expect(queryAll('.chart-bar')).toHaveLength(
      page.financialBreakdown().length
    );
    expect(query('.chart-line')).toBeNull();
    expect(chartTypeButton('Bar').getAttribute('aria-pressed')).toBe('true');
    expect(
      chartTypeButton('Horizontal bars').getAttribute('aria-pressed')
    ).toBe('false');
  });

  it('renders the line chart when Line is selected', () => {
    selectChartType('Line');

    expect(page.financialChartType()).toBe('line');
    expect(query('.breakdown-list')).toBeNull();
    expect(queryAll('.chart-line')).toHaveLength(1);
    expect(queryAll('.chart-dot')).toHaveLength(
      page.financialBreakdown().length
    );
    expect(queryAll('.chart-bar')).toHaveLength(0);
    expect(chartTypeButton('Line').getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps the same financial data and period across chart switches', () => {
    const orders = page.orders();
    const summary = page.financialSummary();
    const breakdown = page.financialBreakdown();
    const anchor = page.financialAnchor();

    selectChartType('Bar');
    expect(page.financialSummary()).toBe(summary);
    expect(page.financialBreakdown()).toBe(breakdown);
    expect(page.orders()).toBe(orders);

    selectChartType('Line');
    expect(page.financialSummary()).toBe(summary);
    expect(page.financialBreakdown()).toBe(breakdown);
    expect(page.orders()).toBe(orders);

    selectChartType('Horizontal bars');
    expect(page.financialBreakdown()).toBe(breakdown);
    expect(page.financialAnchor()).toBe(anchor);
    expect(page.financialPeriod()).toBe('month');
    expect(page.financialSummary().revenue).toBe(300);
    expect(page.financialSummary().paidOrderCount).toBe(2);
  });

  it('renders equivalent values in each chart type for the period', () => {
    const expectedRevenue = page.financialSummary().revenue;
    const expectedOrders = page.financialSummary().paidOrderCount;

    selectChartType('Bar');
    const barTable = query('.chart-figure table');
    expect(barTable?.textContent).toContain(expectedOrders.toString());
    expect(barTable?.textContent).toContain('100.00');
    expect(barTable?.textContent).toContain('200.00');
    expect(barTable?.textContent).not.toContain('900.00');

    selectChartType('Line');
    const lineTable = query('.chart-figure table');
    expect(lineTable?.textContent).toContain(expectedOrders.toString());
    expect(lineTable?.textContent).toContain('100.00');
    expect(lineTable?.textContent).toContain('200.00');
    expect(expectedRevenue).toBe(300);
  });

  it('keeps daily, monthly and annual controls working', () => {
    selectChartType('Bar');

    page.setFinancialPeriod('year');
    fixture.detectChanges();
    expect(page.financialPeriod()).toBe('year');
    expect(page.financialBreakdown()).toHaveLength(12);
    expect(page.financialChartType()).toBe('bar');
    expect(queryAll('.chart-bar')).toHaveLength(12);

    page.setFinancialPeriod('day');
    fixture.detectChanges();
    expect(page.financialPeriod()).toBe('day');
    expect(page.financialBreakdown()).toHaveLength(1);
    expect(query('.chart-type-control')).toBeNull();

    page.setFinancialPeriod('month');
    fixture.detectChanges();
    expect(page.financialChartType()).toBe('bar');
    expect(page.financialBreakdown()).toHaveLength(31);
    expect(queryAll('.chart-bar')).toHaveLength(31);
  });

  it('keeps empty periods and zero-value handling for every chart type', () => {
    ordersSubject.next([]);
    fixture.detectChanges();

    expect(page.financialSummary().revenue).toBe(0);
    expect(
      page.financialBreakdown().every((bucket) => bucket.revenue === 0)
    ).toBe(true);

    selectChartType('Bar');
    expect(query('.chart-empty')?.textContent).toContain('No collected revenue');
    expect(queryAll('.chart-bar')).toHaveLength(0);

    selectChartType('Line');
    expect(query('.chart-empty')?.textContent).toContain('No collected revenue');
    expect(queryAll('.chart-line')).toHaveLength(0);

    selectChartType('Horizontal bars');
    const rows = queryAll('.breakdown-row');
    expect(rows).toHaveLength(page.financialBreakdown().length);
    expect(rows[0].textContent).toContain('0.00');
  });
});

describe('AdminDashboardPage financial chart loading and error states', () => {
  let fixture: ComponentFixture<AdminDashboardPage>;
  let page: AdminDashboardPage;
  let ordersSubject: Subject<Order[]>;

  function setup(ordersSource: Subject<Order[]>): void {
    const productsSubject = new BehaviorSubject<Product[]>([]);
    ordersSubject = ordersSource;

    TestBed.configureTestingModule({
      providers: [
        provideRouter([]),
        {
          provide: ProductsService,
          useValue: { watchProducts: () => productsSubject.asObservable() },
        },
        {
          provide: OrdersService,
          useValue: { watchOrders: () => ordersSubject.asObservable() },
        },
      ],
    });

    fixture = TestBed.createComponent(AdminDashboardPage);
    page = fixture.componentInstance;
    page.financialAnchor.set(new Date(2026, 9, 1));
    fixture.detectChanges();
  }

  afterEach(() => {
    fixture?.destroy();
  });

  it('keeps the chart out while orders are loading', () => {
    setup(new Subject<Order[]>());

    expect(page.ordersStatus()).toBe('loading');
    expect(fixture.nativeElement.querySelector('.financial-section')).toBeNull();
    expect(
      fixture.nativeElement.querySelector('.chart-type-control')
    ).toBeNull();
  });

  it('keeps the existing order error notice and hides the chart', () => {
    setup(new Subject<Order[]>());
    ordersSubject.error(new Error('permission denied'));
    fixture.detectChanges();

    expect(page.ordersStatus()).toBe('error');
    expect(fixture.nativeElement.querySelector('.financial-section')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain(
      'Order counts are unavailable right now.'
    );
  });
});

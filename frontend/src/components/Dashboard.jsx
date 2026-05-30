import React from 'react';
import {
  BarChart3,
  CalendarDays,
  Eye,
  FileText,
  Package,
  PlusCircle,
  Settings,
  ShieldCheck,
  ShoppingCart,
  SlidersHorizontal,
  TrendingUp,
} from 'lucide-react';
import { useAppContext } from '../AppContext';

const PREF_KEY = 'nj_dashboard_preferences_v1';

const DEFAULT_PREFS = {
  range: 'all',
  widgets: {
    kpis: true,
    trend: true,
    products: true,
    quotations: true,
    warranties: true,
    actions: true,
  },
};

const RANGE_OPTIONS = [
  { id: 'all', label: 'All Time' },
  { id: 'today', label: 'Today' },
  { id: 'month', label: 'This Month' },
  { id: 'last30', label: 'Last 30 Days' },
];

const WIDGET_OPTIONS = [
  { id: 'kpis', label: 'KPI Cards' },
  { id: 'trend', label: 'Trend' },
  { id: 'products', label: 'Top Products' },
  { id: 'quotations', label: 'Recent Quotes' },
  { id: 'warranties', label: 'Recent Warranties' },
  { id: 'actions', label: 'Quick Actions' },
];

const formatNumber = (value) => Math.round(value || 0).toLocaleString('en-IN');
const formatCurrency = (value) => `Rs. ${formatNumber(value)}`;

const toNumber = (value) => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = typeof value === 'number'
    ? value
    : Number(String(value).replace(/[^\d.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const getQuotationValue = (quotation) => {
  for (const key of ['grandTotal', 'total', 'amount', 'subtotal']) {
    const value = toNumber(quotation?.[key]);
    if (value !== null) return value;
  }
  return 0;
};

const parseRecordDate = (value) => {
  if (!value) return null;
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value;

  const raw = String(value).trim();
  const dmy = raw.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2,4})$/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]) - 1;
    const year = Number(dmy[3].length === 2 ? `20${dmy[3]}` : dmy[3]);
    const date = new Date(year, month, day);
    if (
      date.getFullYear() === year &&
      date.getMonth() === month &&
      date.getDate() === day
    ) {
      return date;
    }
  }

  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const startOfDay = (date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());
const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const isSameDay = (left, right) => (
  left &&
  right &&
  left.getFullYear() === right.getFullYear() &&
  left.getMonth() === right.getMonth() &&
  left.getDate() === right.getDate()
);

const isInRange = (date, rangeId, now = new Date()) => {
  if (rangeId === 'all') return true;
  if (!date) return false;

  const target = startOfDay(date);
  const today = startOfDay(now);

  if (rangeId === 'today') return isSameDay(target, today);
  if (rangeId === 'month') {
    const monthStart = startOfMonth(today);
    return target >= monthStart && target <= today;
  }
  if (rangeId === 'last30') {
    const start = new Date(today);
    start.setDate(today.getDate() - 29);
    return target >= start && target <= today;
  }
  return true;
};

const sortNewest = (records) => [...records].sort((a, b) => {
  const aTime = parseRecordDate(a.date)?.getTime() || 0;
  const bTime = parseRecordDate(b.date)?.getTime() || 0;
  return bTime - aTime;
});

const getCustomerName = (record) => record?.customer?.name || record?.name || 'Anonymous Customer';

const monthKey = (date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;

const buildTrend = (quotations) => {
  const now = new Date();
  const months = [];

  for (let i = 5; i >= 0; i -= 1) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({
      key: monthKey(date),
      label: date.toLocaleDateString('en-IN', { month: 'short' }),
      count: 0,
      revenue: 0,
    });
  }

  const byKey = new Map(months.map(month => [month.key, month]));
  quotations.forEach((quotation) => {
    const date = parseRecordDate(quotation.date);
    if (!date) return;
    const bucket = byKey.get(monthKey(date));
    if (!bucket) return;
    bucket.count += 1;
    bucket.revenue += getQuotationValue(quotation);
  });

  const maxCount = Math.max(1, ...months.map(month => month.count));
  const maxRevenue = Math.max(1, ...months.map(month => month.revenue));

  return months.map(month => ({
    ...month,
    countHeight: Math.max(6, Math.round((month.count / maxCount) * 100)),
    revenueHeight: Math.max(6, Math.round((month.revenue / maxRevenue) * 100)),
  }));
};

const buildTopProducts = (quotations) => {
  const products = new Map();

  quotations.forEach((quotation) => {
    (quotation.items || []).forEach((item) => {
      const name = item?.name || 'Unnamed Item';
      const qty = toNumber(item?.qty) || 0;
      const price = toNumber(item?.price) || 0;
      const current = products.get(name) || {
        name,
        className: item?.className || 'Products',
        unit: item?.unit || '',
        qty: 0,
        revenue: 0,
      };

      current.qty += qty;
      current.revenue += price * qty;
      if (item?.className === 'Tools & Accessories') current.className = 'Tools & Accessories';
      products.set(name, current);
    });
  });

  const rows = [...products.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5);
  const maxRevenue = Math.max(1, ...rows.map(row => row.revenue));

  return rows.map(row => ({
    ...row,
    width: Math.max(8, Math.round((row.revenue / maxRevenue) * 100)),
  }));
};

const loadPreferences = () => {
  try {
    const raw = localStorage.getItem(PREF_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw);
    return {
      range: parsed.range || DEFAULT_PREFS.range,
      widgets: { ...DEFAULT_PREFS.widgets, ...(parsed.widgets || {}) },
    };
  } catch {
    return DEFAULT_PREFS;
  }
};

function DashboardCard({ icon, label, value, detail, tone = 'accent' }) {
  return (
    <article className={`dash-kpi-card is-${tone}`}>
      <div className="dash-kpi-icon">{icon}</div>
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
        <small>{detail}</small>
      </div>
    </article>
  );
}

function EmptyPanel({ icon, title, text, action }) {
  return (
    <div className="dash-empty">
      <div className="dash-empty-icon">{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
      {action}
    </div>
  );
}

export default function Dashboard() {
  const {
    data,
    setCurrentView,
    setActiveQuotation,
    setActiveWarranty,
    setActiveTab,
  } = useAppContext();

  const [prefs, setPrefs] = React.useState(loadPreferences);
  const quotations = React.useMemo(() => data.quotations || [], [data.quotations]);
  const warranties = React.useMemo(() => data.warranty_certificates || [], [data.warranty_certificates]);

  React.useEffect(() => {
    try {
      localStorage.setItem(PREF_KEY, JSON.stringify(prefs));
    } catch {
      // Dashboard preferences are cosmetic; failing to save should not block work.
    }
  }, [prefs]);

  const dashboard = React.useMemo(() => {
    const now = new Date();
    const filteredQuotations = quotations.filter(q => isInRange(parseRecordDate(q.date), prefs.range, now));
    const filteredWarranties = warranties.filter(w => isInRange(parseRecordDate(w.date), prefs.range, now));
    const todayQuotes = quotations.filter(q => isInRange(parseRecordDate(q.date), 'today', now)).length;
    const monthRevenue = quotations
      .filter(q => isInRange(parseRecordDate(q.date), 'month', now))
      .reduce((sum, q) => sum + getQuotationValue(q), 0);
    const rangeRevenue = filteredQuotations.reduce((sum, q) => sum + getQuotationValue(q), 0);

    return {
      filteredQuotations,
      filteredWarranties,
      todayQuotes,
      monthRevenue,
      rangeRevenue,
      quotationCount: filteredQuotations.length,
      warrantyCount: filteredWarranties.length,
      averageValue: filteredQuotations.length ? rangeRevenue / filteredQuotations.length : 0,
      trend: buildTrend(filteredQuotations),
      topProducts: buildTopProducts(filteredQuotations),
      recentQuotations: sortNewest(filteredQuotations).slice(0, 5),
      recentWarranties: sortNewest(filteredWarranties).slice(0, 5),
    };
  }, [prefs.range, quotations, warranties]);

  const selectedRange = RANGE_OPTIONS.find(option => option.id === prefs.range) || RANGE_OPTIONS[0];

  const setRange = (range) => {
    setPrefs(current => ({ ...current, range }));
  };

  const toggleWidget = (id) => {
    setPrefs(current => ({
      ...current,
      widgets: {
        ...current.widgets,
        [id]: !current.widgets[id],
      },
    }));
  };

  const openQuotation = (quotation) => {
    setActiveQuotation(quotation);
    if (setActiveTab) setActiveTab('quotation');
    setCurrentView('quotation_document');
  };

  const openWarranty = (warranty) => {
    const matchingQuote = quotations.find(q => q.id === warranty.quotationId);
    if (matchingQuote) {
      setActiveQuotation(matchingQuote);
      if (setActiveTab) setActiveTab(warranty.warrantyNo || warranty.id);
      setCurrentView('quotation_document');
      return;
    }

    setActiveWarranty(warranty);
    setCurrentView('warranty_document');
  };

  return (
    <div className="dashboard-shell animate-fade-up">
      <section className="dash-hero">
        <div>
          <div className="qd-kicker">Business Snapshot</div>
          <h1>Real-time quotation desk overview</h1>
          <p>
            Sales, warranties, and product movement calculated from saved quotation snapshots.
          </p>
        </div>

        <div className="dash-controls" aria-label="Dashboard controls">
          <div className="dash-range" aria-label="Date range">
            {RANGE_OPTIONS.map(option => (
              <button
                key={option.id}
                type="button"
                onClick={() => setRange(option.id)}
                className={prefs.range === option.id ? 'is-active' : ''}
              >
                {option.label}
              </button>
            ))}
          </div>

          <details className="dash-widget-menu">
            <summary>
              <SlidersHorizontal size={15} />
              Widgets
            </summary>
            <div>
              {WIDGET_OPTIONS.map(option => (
                <label key={option.id}>
                  <input
                    type="checkbox"
                    checked={prefs.widgets[option.id]}
                    onChange={() => toggleWidget(option.id)}
                  />
                  <span>{option.label}</span>
                </label>
              ))}
            </div>
          </details>
        </div>
      </section>

      {quotations.length === 0 && warranties.length === 0 && (
        <section className="dash-start-card">
          <div>
            <span className="dash-start-icon"><ShoppingCart size={22} /></span>
            <div>
              <strong>No sales records yet</strong>
              <p>Create the first quotation and this dashboard will start filling automatically.</p>
            </div>
          </div>
          <button className="btn-primary" type="button" onClick={() => setCurrentView('quotation_desk')}>
            <PlusCircle size={16} />
            New Quotation
          </button>
        </section>
      )}

      {prefs.widgets.kpis && (
        <section className="dash-kpi-grid" aria-label="Dashboard metrics">
          <DashboardCard
            icon={<CalendarDays size={19} />}
            label="Today's Quotations"
            value={formatNumber(dashboard.todayQuotes)}
            detail="Created today"
          />
          <DashboardCard
            icon={<TrendingUp size={19} />}
            label="This Month Revenue"
            value={formatCurrency(dashboard.monthRevenue)}
            detail="Current calendar month"
            tone="gold"
          />
          <DashboardCard
            icon={<FileText size={19} />}
            label="Total Quotations"
            value={formatNumber(dashboard.quotationCount)}
            detail={selectedRange.label}
            tone="ink"
          />
          <DashboardCard
            icon={<ShieldCheck size={19} />}
            label="Warranties Issued"
            value={formatNumber(dashboard.warrantyCount)}
            detail={selectedRange.label}
            tone="green"
          />
          <DashboardCard
            icon={<BarChart3 size={19} />}
            label="Average Quote Value"
            value={formatCurrency(dashboard.averageValue)}
            detail="Selected range"
            tone="soft"
          />
        </section>
      )}

      <section className="dash-grid">
        {prefs.widgets.trend && (
          <article className="dash-panel dash-trend-panel">
            <div className="dash-panel-head">
              <div>
                <span>Trend</span>
                <h2>Last 6 months</h2>
              </div>
              <small>{selectedRange.label}</small>
            </div>

            <div className="dash-trend-chart">
              {dashboard.trend.map(month => (
                <div className="dash-trend-month" key={month.key}>
                  <div className="dash-trend-bars">
                    <span
                      className="dash-bar is-revenue"
                      style={{ '--dash-bar-height': `${month.revenueHeight}%` }}
                      title={`${month.label}: ${formatCurrency(month.revenue)}`}
                    />
                    <span
                      className="dash-bar is-count"
                      style={{ '--dash-bar-height': `${month.countHeight}%` }}
                      title={`${month.label}: ${month.count} quotations`}
                    />
                  </div>
                  <strong>{month.label}</strong>
                  <small>{month.count}</small>
                </div>
              ))}
            </div>

            <div className="dash-chart-legend">
              <span><i className="is-revenue" /> Revenue</span>
              <span><i className="is-count" /> Quotes</span>
            </div>
          </article>
        )}

        {prefs.widgets.products && (
          <article className="dash-panel dash-products-panel">
            <div className="dash-panel-head">
              <div>
                <span>Product Movement</span>
                <h2>Top products</h2>
              </div>
              <small>{selectedRange.label}</small>
            </div>

            {dashboard.topProducts.length === 0 ? (
              <EmptyPanel
                icon={<Package size={24} />}
                title="No product movement"
                text="Generated quotation items will appear here."
              />
            ) : (
              <div className="dash-product-list">
                {dashboard.topProducts.map(product => (
                  <div className="dash-product-row" key={product.name}>
                    <div className="dash-product-copy">
                      <strong>{product.name}</strong>
                      <span>{product.className} - {formatNumber(product.qty)} {product.unit}</span>
                    </div>
                    <div className="dash-product-value">
                      <strong>{formatCurrency(product.revenue)}</strong>
                      <span style={{ '--dash-product-width': `${product.width}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        )}

        {prefs.widgets.quotations && (
          <article className="dash-panel">
            <div className="dash-panel-head">
              <div>
                <span>Recent Activity</span>
                <h2>Recent quotations</h2>
              </div>
              <button type="button" onClick={() => setCurrentView('quotations')}>View all</button>
            </div>

            {dashboard.recentQuotations.length === 0 ? (
              <EmptyPanel
                icon={<FileText size={24} />}
                title="No quotations in this range"
                text="Create or change the range to see saved quotations."
                action={(
                  <button className="btn-secondary" type="button" onClick={() => setCurrentView('quotation_desk')}>
                    New Quotation
                  </button>
                )}
              />
            ) : (
              <div className="dash-record-list">
                {dashboard.recentQuotations.map(quotation => (
                  <button
                    type="button"
                    className="dash-record-row"
                    key={quotation.id}
                    onClick={() => openQuotation(quotation)}
                  >
                    <div>
                      <strong>{quotation.id}</strong>
                      <span>{getCustomerName(quotation)}</span>
                    </div>
                    <div>
                      <strong>{formatCurrency(getQuotationValue(quotation))}</strong>
                      <span>{quotation.date || 'No date'}</span>
                    </div>
                    <Eye size={15} />
                  </button>
                ))}
              </div>
            )}
          </article>
        )}

        {prefs.widgets.warranties && (
          <article className="dash-panel">
            <div className="dash-panel-head">
              <div>
                <span>Certificates</span>
                <h2>Recent warranties</h2>
              </div>
              <button type="button" onClick={() => setCurrentView('warranties')}>View all</button>
            </div>

            {dashboard.recentWarranties.length === 0 ? (
              <EmptyPanel
                icon={<ShieldCheck size={24} />}
                title="No warranties in this range"
                text="Warranty certificates appear after eligible quotations."
              />
            ) : (
              <div className="dash-record-list">
                {dashboard.recentWarranties.map(warranty => (
                  <button
                    type="button"
                    className="dash-record-row"
                    key={warranty.warrantyNo || warranty.id}
                    onClick={() => openWarranty(warranty)}
                  >
                    <div>
                      <strong>{warranty.warrantyNo || warranty.id}</strong>
                      <span>{getCustomerName(warranty)}</span>
                    </div>
                    <div>
                      <strong>{warranty.template?.title || 'Warranty Certificate'}</strong>
                      <span>{warranty.date || 'No date'}</span>
                    </div>
                    <Eye size={15} />
                  </button>
                ))}
              </div>
            )}
          </article>
        )}

        {prefs.widgets.actions && (
          <article className="dash-panel dash-actions-panel">
            <div className="dash-panel-head">
              <div>
                <span>Shortcuts</span>
                <h2>Quick actions</h2>
              </div>
            </div>

            <div className="dash-action-grid">
              <button type="button" onClick={() => setCurrentView('quotation_desk')}>
                <PlusCircle size={18} />
                <span>New Quotation</span>
              </button>
              <button type="button" onClick={() => setCurrentView('quotations')}>
                <FileText size={18} />
                <span>View Quotations</span>
              </button>
              <button type="button" onClick={() => setCurrentView('warranties')}>
                <ShieldCheck size={18} />
                <span>View Warranties</span>
              </button>
              <button type="button" onClick={() => setCurrentView('settings')}>
                <Settings size={18} />
                <span>Settings</span>
              </button>
            </div>
          </article>
        )}
      </section>
    </div>
  );
}

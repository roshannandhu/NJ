export default function StatsBar() {
  // Dummy logic matching original HTML
  const totalQuotes = 0; // Replace with actual data logic later
  const warrantiesIssued = 0;
  const todayQuotes = 0;

  return (
    <div className="animate-fade-up" style={{
      display: 'grid',
      gridTemplateColumns: 'repeat(4, 1fr)',
      gap: '20px',
      marginBottom: '28px'
    }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '6px' }}>Today's Quotations</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--ink)', marginBottom: '4px' }}>{todayQuotes}</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>None yet today</div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '6px' }}>This Month</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--ink)', marginBottom: '4px' }}>0</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>No quotations</div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '6px' }}>Total Quotations</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '26px', color: 'var(--ink)', marginBottom: '4px' }}>{totalQuotes}</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>Get started below</div>
      </div>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', padding: '20px', boxShadow: 'var(--shadow-sm)' }}>
        <div style={{ fontSize: '11px', letterSpacing: '0.14em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 500, marginBottom: '6px' }}>Total Revenue</div>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: '20px', color: 'var(--ink)', marginBottom: '4px' }}>—</div>
        <div style={{ fontSize: '12px', color: 'var(--ink-soft)' }}>{warrantiesIssued} warranties issued</div>
      </div>
    </div>
  );
}

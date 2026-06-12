import { useState, useMemo } from 'react';
import { useAppContext } from '../AppContext';
import { Search, Eye, ShieldCheck, FileText, Trash2, Calendar, Edit3, PackagePlus } from 'lucide-react';
import { clearQuotations, clearWarranties, deleteQuotation, deleteWarranty } from '../api';
import { addonItemsOf } from '../addons';

// Rows rendered initially / added per "Show more" click. The list itself can
// hold any number of records — only this many reach the DOM at once, so the
// page stays fast even with 100k+ history entries.
const PAGE_SIZE = 100;

export default function History({ type }) {
  const { data, setData, setCurrentView, setActiveQuotation, setActiveWarranty, loadQuotationForEdit, startAddonOrder, setActiveTab, showToast } = useAppContext();
  const [search, setSearch] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  // Add-on selection mode: armed by the "Add-on Order" button above the list;
  // while on, clicking a quotation row starts an add-on for THAT quotation
  // instead of opening it.
  const [addonSelectMode, setAddonSelectMode] = useState(false);

  const isQuotation = type === 'quotations';

  // Load live data from context registry. Hidden "warranty-only" quotations
  // (backing records for standalone warranties) never appear in Quotation History.
  // Dedupe by id/warrantyNo so the same record never shows twice (id uniquely
  // identifies a record, so two entries with the same id are the same one).
  const rawList = useMemo(() => {
    const seen = new Set();
    return (isQuotation
      ? (data.quotations || []).filter(q => !q.warrantyOnly)
      : (data.warranty_certificates || [])
    ).filter(r => {
      const k = isQuotation ? r.id : (r.warrantyNo || r.id);
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }, [isQuotation, data.quotations, data.warranty_certificates]);

  // Filter based on search term (ID or Customer Name)
  const filteredData = useMemo(() => {
    const term = search.toLowerCase().trim();
    if (!term) return rawList;
    return rawList.filter(row => {
      const id = (isQuotation ? row.id : (row.warrantyNo || row.id || '')).toLowerCase();
      const name = (row.customer?.name || row.name || '').toLowerCase();
      return id.includes(term) || name.includes(term);
    });
  }, [rawList, search, isQuotation]);

  // Warranty certs grouped by parent quotation ONCE — the per-row lookup is then
  // O(1) instead of scanning the whole certificate list for every rendered row.
  const certsByQuotation = useMemo(() => {
    if (!isQuotation) return new Map();
    const m = new Map();
    (data.warranty_certificates || []).forEach(w => {
      if (!w.quotationId) return;
      const arr = m.get(w.quotationId);
      if (arr) arr.push(w); else m.set(w.quotationId, [w]);
    });
    return m;
  }, [isQuotation, data.warranty_certificates]);

  // Only a window of rows reaches the DOM; "Show more" extends it.
  const visibleData = filteredData.slice(0, visibleCount);
  const setSearchAndReset = (v) => { setSearch(v); setVisibleCount(PAGE_SIZE); };

  // Row click: in add-on selection mode a quotation row IS the selection;
  // otherwise open the document as before.
  const handleRowClick = (row) => {
    if (addonSelectMode && isQuotation) {
      setAddonSelectMode(false);
      startAddonOrder(row);
      return;
    }
    handleView(row);
  };

  const handleView = (row) => {
    if (isQuotation) {
      setActiveQuotation(row);
      if (setActiveTab) setActiveTab('quotation');
      setCurrentView('quotation_document');
    } else {
      // Find the parent quotation. A standalone "Warranty Only" cert is backed by
      // a hidden warrantyOnly quotation — open the certificate directly in that
      // case (and when no parent exists), never the blank backing quotation.
      const matchingQuote = data.quotations?.find(q => q.id === row.quotationId);
      if (matchingQuote && !matchingQuote.warrantyOnly) {
        setActiveQuotation(matchingQuote);
        if (setActiveTab) setActiveTab(row.warrantyNo || row.id);
        setCurrentView('quotation_document');
      } else {
        setActiveWarranty(row);
        setCurrentView('warranty_document');
      }
    }
  };

  // Open a quotation directly on one of its warranty certificates.
  const openWarranty = (quotation, cert) => {
    setActiveQuotation(quotation);
    if (setActiveTab) setActiveTab(cert.warrantyNo || cert.id);
    setCurrentView('quotation_document');
  };

  // Delete ONE record. Mirrors the backend's behaviour locally so the on-screen
  // list matches the database without a refetch:
  //   • Quotation → backend cascades to its warranty certificates, so we also drop
  //     every cert whose quotationId is this quotation.
  //   • Warranty → delete the single cert (keyed on its id, not warrantyNo). If it
  //     is a standalone "warranty only" cert, its hidden backing quotation is
  //     deleted too (deleteQuotation cascades) so no orphan is left behind.
  const handleDeleteRow = async (row) => {
    if (isQuotation) {
      const linked = (data.warranty_certificates || []).filter(w => w.quotationId === row.id);
      const extra = linked.length ? `\n\nIts ${linked.length} linked warranty certificate${linked.length === 1 ? '' : 's'} will also be deleted.` : '';
      if (!window.confirm(`Delete quotation ${row.id}? This cannot be undone.${extra}`)) return;
      try {
        await deleteQuotation(row.id);
      } catch {
        showToast('Backend sync failed', 'error');
      }
      setData(prev => ({
        ...prev,
        quotations: (prev.quotations || []).filter(q => q.id !== row.id),
        warranty_certificates: (prev.warranty_certificates || []).filter(w => w.quotationId !== row.id),
      }));
      showToast('Quotation deleted', 'success');
      return;
    }

    // Warranty row.
    const certId = row.id || row.warrantyNo;
    const label = row.warrantyNo || row.id;
    if (!window.confirm(`Delete warranty certificate ${label}? This cannot be undone.`)) return;
    // A standalone "warranty only" cert is backed by a hidden quotation — remove it too.
    const backing = (data.quotations || []).find(q => q.id === row.quotationId && q.warrantyOnly);
    try {
      await deleteWarranty(certId);
      if (backing) await deleteQuotation(backing.id);
    } catch {
      showToast('Backend sync failed', 'error');
    }
    setData(prev => ({
      ...prev,
      warranty_certificates: (prev.warranty_certificates || []).filter(w => (w.id || w.warrantyNo) !== certId),
      quotations: backing ? (prev.quotations || []).filter(q => q.id !== backing.id) : prev.quotations,
    }));
    showToast('Warranty deleted', 'success');
  };

  const handleClearHistory = async () => {
    if (window.confirm(`Are you sure you want to delete all historical ${type} from local storage? This action is irreversible.`)) {
      try {
        if (isQuotation) {
          await clearQuotations();
        } else {
          await clearWarranties();
        }
      } catch {
        showToast("Backend sync failed", "error");
      }
      setData(prev => {
        const key = isQuotation ? 'quotations' : 'warranty_certificates';
        return {
          ...prev,
          [key]: []
        };
      });
      showToast(`Cleared all historical ${type} successfully`, "success");
    }
  };

  // Square icon-button base for the per-row actions (kept compact so up to four
  // actions fit the Actions column without spilling into neighbouring columns).
  const iconBtn = {
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    width: '32px', height: '32px', flexShrink: 0, padding: 0,
    borderRadius: 'var(--radius-sm)', background: 'white',
    border: '1px solid var(--line)', cursor: 'pointer',
  };

  return (
    <div className="animate-fade-up" style={{ background: 'var(--bg)', minHeight: 'calc(100vh - 160px)' }}>
      
      {/* History Header Controls */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        
        {/* Search Input Block */}
        <div style={{ 
          display: 'flex', 
          alignItems: 'center', 
          background: 'var(--surface)', 
          border: '1px solid var(--line)', 
          borderRadius: 'var(--radius)', 
          padding: '12px 18px', 
          width: '100%', 
          maxWidth: '420px',
          boxShadow: 'var(--shadow-sm)',
          transition: 'all 0.2s'
        }}
        onFocus={(e) => e.currentTarget.style.borderColor = 'var(--accent)'}
        onBlur={(e) => e.currentTarget.style.borderColor = 'var(--line)'}
        >
          <Search size={18} color="var(--ink-soft)" style={{ marginRight: '12px', flexShrink: 0 }}/>
          <input
            value={search}
            onChange={(e) => setSearchAndReset(e.target.value)}
            placeholder={isQuotation ? "Search by customer name or quote ID..." : "Search by customer name or certificate ID..."} 
            style={{ border: 'none', background: 'transparent', flex: 1, fontSize: '14px', color: 'var(--ink)', width: '100%' }} 
          />
        </div>

        {/* Add-on Order (text button): arms selection mode — the next quotation
            clicked becomes the target for adding more products. */}
        {isQuotation && rawList.length > 0 && (
          <button
            onClick={() => setAddonSelectMode(m => !m)}
            className="hover-lift"
            title="Add more products to an existing quotation — click this, then click the quotation"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              padding: '12px 20px',
              background: addonSelectMode ? '#b45309' : '#FDF6EC',
              border: '1.5px solid #b45309',
              color: addonSelectMode ? '#fff' : '#b45309',
              borderRadius: 'var(--radius)',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '13px',
            }}
          >
            <PackagePlus size={16} /> {addonSelectMode ? 'Cancel — choosing quotation…' : 'Add-on Order'}
          </button>
        )}

        {/* Clear History Registry Button */}
        {rawList.length > 0 && (
          <button
            onClick={handleClearHistory}
            className="hover-lift"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '8px', 
              padding: '12px 20px', 
              background: 'transparent', 
              border: '1.5px solid var(--red)', 
              color: 'var(--red)', 
              borderRadius: 'var(--radius)', 
              fontWeight: 700, 
              cursor: 'pointer',
              fontSize: '13px'
            }}
          >
            <Trash2 size={16} /> Clear {isQuotation ? 'Quotation' : 'Warranty'} History
          </button>
        )}
      </div>

      {/* Add-on selection instruction banner */}
      {addonSelectMode && isQuotation && (
        <div style={{
          display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '16px',
          padding: '12px 16px', borderRadius: 'var(--radius)',
          background: '#FDF6EC', border: '1.5px dashed #b45309',
          color: '#b45309', fontSize: '13px', fontWeight: 600,
        }}>
          <PackagePlus size={16} style={{ flexShrink: 0 }} />
          <span>
            <strong>Click the quotation you want to add products to.</strong> The original items and amounts will stay unchanged — new products are added as "Added Later".
          </span>
        </div>
      )}

      {/* Database Results Container */}
      <div style={{ background: 'var(--surface)', border: addonSelectMode && isQuotation ? '1.5px solid #b45309' : '1px solid var(--line)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        
        {/* Table Header Row */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isQuotation ? '140px 1.5fr 1fr 120px 120px 160px' : '160px 1.5fr 1.5fr 120px 110px',
          background: 'var(--bg-warm)',
          padding: '16px 24px', 
          fontSize: '11px', 
          textTransform: 'uppercase', 
          letterSpacing: '0.12em', 
          color: 'var(--ink-soft)', 
          fontWeight: 700,
          borderBottom: '1px solid var(--line)'
        }}>
          <div>Record ID</div>
          <div>Customer / Owner</div>
          {isQuotation ? <div>Product Lines</div> : <div>Certified Product</div>}
          {isQuotation && <div>Grand Total</div>}
          <div>Date Created</div>
          <div style={{ textAlign: 'right' }}>Actions</div>
        </div>

        {/* Table Body Row List */}
        <div>
          {visibleData.map((row, i) => {
            const rowId = isQuotation ? row.id : (row.warrantyNo || row.id);
            const customerName = row.customer?.name || row.name || 'Anonymous Customer';
            const dateVal = row.date;
            // Warranties linked to this quotation (for the status chip + open button).
            const rowCerts = isQuotation ? (certsByQuotation.get(row.id) || []) : [];

            return (
              <div
                key={i}
                onClick={() => handleRowClick(row)}
                title={addonSelectMode && isQuotation ? `Add more products to ${rowId}` : undefined}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isQuotation ? '140px 1.5fr 1fr 120px 120px 160px' : '160px 1.5fr 1.5fr 120px 110px',
                  padding: '18px 24px',
                  borderBottom: '1px solid var(--line-soft)', 
                  alignItems: 'center', 
                  transition: 'background-color 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = (addonSelectMode && isQuotation) ? '#FDF6EC' : 'var(--bg-warm)'}
                onMouseLeave={e => e.currentTarget.style.backgroundColor = 'transparent'}
              >
                {/* ID block with custom monospace */}
                <div style={{ 
                  fontFamily: 'var(--font-mono)', 
                  fontSize: '12.5px', 
                  fontWeight: 700, 
                  color: isQuotation ? 'var(--ink)' : 'var(--accent)',
                }}>
                  {rowId}
                </div>

                {/* Customer Details */}
                <div style={{ fontWeight: 600, color: 'var(--ink)', fontSize: '14.5px' }}>
                  {customerName}
                </div>
                
                {/* Spec specifics */}
                {isQuotation ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <FileText size={14} color="var(--ink-soft)" />
                      <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-mid)' }}>
                        {row.items?.length || 0} items
                      </span>
                    </div>
                    {addonItemsOf(row).length > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#b45309' }}
                        title="This quotation has add-on products added after it was generated">
                        <PackagePlus size={12} /> +{addonItemsOf(row).length} added later
                      </div>
                    )}
                    {rowCerts.length > 0 && (
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: '5px', fontSize: '11px', fontWeight: 700, color: '#15803d' }}
                        title={rowCerts.map(c => c.warrantyNo || c.id).join(', ')}>
                        <ShieldCheck size={12} /> {rowCerts.length === 1 ? (rowCerts[0].warrantyNo || rowCerts[0].id) : `${rowCerts.length} warranties`}
                      </div>
                    )}
                  </div>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: 'var(--ink-mid)', fontWeight: 600 }}>
                    <ShieldCheck size={14} color="var(--accent)" />
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: '180px' }}>
                      {row.certData?.productName || row.template?.title || 'Certified Tiles'}
                    </span>
                  </div>
                )}
                
                {/* Quotation Amount */}
                {isQuotation && (
                  <div style={{ fontWeight: 700, fontSize: '14px', color: 'var(--accent-deep)', fontFamily: 'var(--font-mono)' }}>
                    ₹{Math.round(row.grandTotal || row.amount || 0).toLocaleString('en-IN')}
                  </div>
                )}
                
                {/* Date */}
                <div style={{ fontSize: '13px', color: 'var(--ink-soft)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <Calendar size={13} color="var(--ink-soft)" />
                  {dateVal}
                </div>
                
                {/* Actions — compact icon buttons so they never overflow the
                    column (text labels for 3-4 actions used to spill into the
                    Date / Grand Total columns). Tooltips carry the meaning. */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                  {isQuotation && rowCerts.length > 0 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); openWarranty(row, rowCerts[0]); }}
                      title="Open the warranty certificate for this quotation"
                      style={{ ...iconBtn, color: '#15803d' }}
                    >
                      <ShieldCheck size={15}/>
                    </button>
                  )}
                  {isQuotation && (
                    <button
                      onClick={(e) => { e.stopPropagation(); loadQuotationForEdit(row); }}
                      title="Edit this quotation (loads it into Checkout)"
                      style={{ ...iconBtn, color: 'var(--accent)' }}
                    >
                      <Edit3 size={15}/>
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleView(row); }}
                    title="View"
                    style={{ ...iconBtn, color: 'var(--ink)' }}
                  >
                    <Eye size={15}/>
                  </button>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDeleteRow(row); }}
                    title={isQuotation ? 'Delete this quotation' : 'Delete this warranty certificate'}
                    style={{ ...iconBtn, color: 'var(--red)', borderColor: 'var(--red)' }}
                  >
                    <Trash2 size={15}/>
                  </button>
                </div>
              </div>
            );
          })}

          {/* Windowed rendering: load the next page of rows on demand. */}
          {filteredData.length > visibleCount && (
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '16px', padding: '18px 24px' }}>
              <span style={{ fontSize: '13px', color: 'var(--ink-soft)', fontWeight: 600 }}>
                Showing {visibleCount.toLocaleString('en-IN')} of {filteredData.length.toLocaleString('en-IN')} records
              </span>
              <button
                onClick={() => setVisibleCount(c => c + 2 * PAGE_SIZE)}
                className="hover-lift"
                style={{
                  padding: '10px 22px', background: 'var(--surface)', border: '1.5px solid var(--line)',
                  borderRadius: 'var(--radius-full)', fontWeight: 700, fontSize: '13px', color: 'var(--ink)', cursor: 'pointer',
                }}
              >
                Show more
              </button>
            </div>
          )}

          {/* Empty Registry State */}
          {filteredData.length === 0 && (
            <div style={{ textAlign: 'center', padding: '80px 24px', color: 'var(--ink-soft)' }}>
              <div style={{ 
                width: '64px', 
                height: '64px', 
                borderRadius: '50%', 
                background: 'var(--bg-warm)', 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center', 
                color: 'var(--ink-soft)',
                margin: '0 auto 16px',
                opacity: 0.8
              }}>
                <Search size={32} strokeWidth={1.5} />
              </div>
              <h4 style={{ fontSize: '16px', fontWeight: 600, color: 'var(--ink)', margin: '0 0 4px' }}>No records found</h4>
              <p style={{ fontSize: '13px', margin: 0 }}>
                {rawList.length === 0 
                  ? `There are no historical ${type} logged in this terminal database.`
                  : "Try searching with a different client name or certificate ID number."}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

import React, { useState } from 'react';
import { useAppContext } from '../AppContext';
import { Search, Eye, ShieldCheck, FileText, Trash2, Calendar, Edit3 } from 'lucide-react';
import { clearQuotations, clearWarranties } from '../api';

export default function History({ type }) {
  const { data, setData, setCurrentView, setActiveQuotation, setActiveWarranty, loadQuotationForEdit, activeTab, setActiveTab, showToast } = useAppContext();
  const [search, setSearch] = useState('');

  const isQuotation = type === 'quotations';
  
  // Load live data from context registry
  const rawList = isQuotation ? (data.quotations || []) : (data.warranty_certificates || []);

  // Filter based on search term (ID or Customer Name)
  const filteredData = rawList.filter(row => {
    const term = search.toLowerCase().trim();
    if (!term) return true;

    const id = (isQuotation ? row.id : (row.warrantyNo || row.id || '')).toLowerCase();
    const name = (row.customer?.name || row.name || '').toLowerCase();
    return id.includes(term) || name.includes(term);
  });

  const handleView = (row) => {
    if (isQuotation) {
      setActiveQuotation(row);
      if (setActiveTab) setActiveTab('quotation');
      setCurrentView('quotation_document');
    } else {
      // Find matching quotation
      const matchingQuote = data.quotations?.find(q => q.id === row.quotationId);
      if (matchingQuote) {
        setActiveQuotation(matchingQuote);
        if (setActiveTab) setActiveTab(row.warrantyNo || row.id);
        setCurrentView('quotation_document');
      } else {
        // Fallback: If no matching quotation, set the activeWarranty and view warranty_document
        setActiveWarranty(row);
        setCurrentView('warranty_document');
      }
    }
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
            onChange={(e) => setSearch(e.target.value)}
            placeholder={isQuotation ? "Search by customer name or quote ID..." : "Search by customer name or certificate ID..."} 
            style={{ border: 'none', background: 'transparent', flex: 1, fontSize: '14px', color: 'var(--ink)', width: '100%' }} 
          />
        </div>

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

      {/* Database Results Container */}
      <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--radius-lg)', overflow: 'hidden', boxShadow: 'var(--shadow-sm)' }}>
        
        {/* Table Header Row */}
        <div style={{ 
          display: 'grid', 
          gridTemplateColumns: isQuotation ? '140px 1.5fr 1fr 120px 120px 110px' : '160px 1.5fr 1.5fr 120px 110px', 
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
          {filteredData.map((row, i) => {
            const rowId = isQuotation ? row.id : (row.warrantyNo || row.id);
            const customerName = row.customer?.name || row.name || 'Anonymous Customer';
            const dateVal = row.date;
            
            return (
              <div 
                key={i} 
                onClick={() => handleView(row)}
                style={{ 
                  display: 'grid', 
                  gridTemplateColumns: isQuotation ? '140px 1.5fr 1fr 120px 120px 110px' : '160px 1.5fr 1.5fr 120px 110px', 
                  padding: '18px 24px', 
                  borderBottom: '1px solid var(--line-soft)', 
                  alignItems: 'center', 
                  transition: 'background-color 0.2s',
                  cursor: 'pointer'
                }}
                onMouseEnter={e => e.currentTarget.style.backgroundColor = 'var(--bg-warm)'}
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
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <FileText size={14} color="var(--ink-soft)" />
                    <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--ink-mid)' }}>
                      {row.items?.length || 0} items
                    </span>
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
                
                {/* Actions */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                  {isQuotation && (
                    <button
                      onClick={(e) => { e.stopPropagation(); loadQuotationForEdit(row); }}
                      className="btn-secondary"
                      title="Edit this quotation (loads it into Checkout)"
                      style={{
                        padding: '8px 12px',
                        fontSize: '12px',
                        gap: '6px',
                        borderRadius: 'var(--radius-sm)',
                        background: 'white',
                        border: '1px solid var(--line)',
                        cursor: 'pointer',
                        fontWeight: 600,
                        color: 'var(--accent)'
                      }}
                    >
                      <Edit3 size={13}/> Edit
                    </button>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleView(row); }}
                    className="btn-secondary"
                    style={{
                      padding: '8px 14px',
                      fontSize: '12px',
                      gap: '6px',
                      borderRadius: 'var(--radius-sm)',
                      background: 'white',
                      border: '1px solid var(--line)',
                      cursor: 'pointer',
                      fontWeight: 600
                    }}
                  >
                    <Eye size={13}/> View
                  </button>
                </div>
              </div>
            );
          })}

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

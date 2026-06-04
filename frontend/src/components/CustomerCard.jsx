import { useAppContext } from '../AppContext';

export default function CustomerCard() {
  const { customer, setCustomer } = useAppContext();

  const handleChange = (e) => {
    setCustomer(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  return (
    <div style={{
      background: 'var(--surface)', padding: '28px 32px', borderRadius: 'var(--radius-lg)',
      boxShadow: 'var(--shadow-sm)', border: '1px solid var(--line)', marginBottom: '32px'
    }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '24px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Customer Name *</label>
          <input 
            name="name" value={customer.name || ''} onChange={handleChange} placeholder="Required for quotation"
            style={{ border: 'none', borderBottom: '1px solid var(--line)', padding: '8px 0', fontSize: '15px', background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Phone</label>
          <input 
            name="phone" value={customer.phone || ''} onChange={handleChange} placeholder="Optional"
            style={{ border: 'none', borderBottom: '1px solid var(--line)', padding: '8px 0', fontSize: '15px', background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Email</label>
          <input 
            name="email" value={customer.email || ''} onChange={handleChange} placeholder="Optional"
            style={{ border: 'none', borderBottom: '1px solid var(--line)', padding: '8px 0', fontSize: '15px', background: 'transparent' }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <label style={{ fontSize: '11px', letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--ink-soft)', fontWeight: 600 }}>Site Address</label>
          <input 
            name="address" value={customer.address || ''} onChange={handleChange} placeholder="Delivery location"
            style={{ border: 'none', borderBottom: '1px solid var(--line)', padding: '8px 0', fontSize: '15px', background: 'transparent' }}
          />
        </div>
      </div>
    </div>
  );
}

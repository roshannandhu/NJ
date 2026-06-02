// Warranty certificate generation — the SINGLE source of truth for turning a
// quotation into warranty certificate(s). Every warranty is backed by a
// quotation so it can never be orphaned: either a real quotation (the "Create
// Warranty" action in QuotationDocument) or a hidden warranty-only quotation
// minted by `buildWarrantyOnlyQuotation` for the standalone "Warranty Only"
// flow. One certificate is produced per distinct warranty template the
// quotation's products require.
//
// IDs are DETERMINISTIC — derived from the quotation id + the warranty template
// id — so re-running for the same quotation reuses the same ids (the backend
// upserts by id, never duplicating, and callers filter out ids that already
// exist so a user's edits to an existing certificate are never overwritten).

// Resolve the unique warranty templates linked to the product classes on a
// quotation. Tool/accessory classes have no warrantyId, so they're naturally
// excluded. Each entry carries `forClass` so the certificate knows its product.
export function warrantyTemplatesForQuotation(quotation, data) {
  const seen = new Set();
  const list = [];
  (quotation.items || []).forEach((item) => {
    const cls = data.classes?.find((c) => c.name === item.className);
    if (cls?.warrantyId && !seen.has(cls.warrantyId)) {
      const tmpl = data.warranties?.find((w) => w.id === cls.warrantyId);
      if (tmpl) { seen.add(cls.warrantyId); list.push({ ...tmpl, forClass: cls.name }); }
    }
  });
  return list;
}

// Build a hidden, minimal "warranty-only" quotation that backs a standalone
// warranty (created from the Desk's "Warranty Only" button). It carries just
// enough to satisfy the no-orphan rule and to drive cert generation; it is
// flagged `warrantyOnly` so it stays hidden from Quotation History / Dashboard.
export function buildWarrantyOnlyQuotation(cart, customer, settings) {
  const id = `${settings.quotationPrefix || 'NJ-Q'}-${Date.now().toString().slice(-6)}`;
  return {
    id,
    items: [...cart],
    customer: { ...(customer || {}) },
    date: new Date().toLocaleDateString('en-GB'),
    warrantyOnly: true,
    grandTotal: 0,
  };
}

// Build the warranty certificate object(s) for a quotation. Returns one cert per
// applicable template, each linked back to the quotation via `quotationId`.
export function buildWarrantyCertsForQuotation(quotation, data, settings) {
  const templates = warrantyTemplatesForQuotation(quotation, data);
  if (templates.length === 0) return [];

  const qSuffix = String(quotation.id || '').replace(/^.*?-/, '');
  const wPrefix = settings.warrantyPrefix || 'NJ-W';
  const certIdFor = (tmpl) =>
    `${wPrefix}-${qSuffix}-${String(tmpl.id).replace(/[^a-zA-Z0-9]+/g, '').slice(0, 12)}`;

  const today = new Date().toLocaleDateString('en-GB');
  const cart = quotation.items || [];

  return templates.map((tmpl) => {
    const matchingItems = cart.filter((item) => item.className === tmpl.forClass);
    const selectedItem = matchingItems.length > 0 ? matchingItems[0] : (cart[0] || null);
    const wNo = certIdFor(tmpl);
    return {
      id: wNo,
      quotationId: quotation.id,
      items: [...cart],
      customer: { ...(quotation.customer || {}) },
      date: today,
      warrantyNo: wNo,
      template: tmpl,
      certData: {
        sellerName: data.company?.name || 'NOUFAL & JABBAR INTERNATIONAL LLP',
        batchNo: selectedItem?.batchNo || '',
        purchaseDate: today,
        siteAddress: (quotation.customer || {}).address || '',
        productName: selectedItem?.name || 'Standard Shingle',
        productColor: selectedItem?.color || 'N/A',
        productQty: selectedItem?.qty || 1,
        productUnit: selectedItem?.unit || 'sqft',
        selectedCartId: selectedItem?.cartId || '',
      },
    };
  });
}

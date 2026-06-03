import React, { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getConfig } from '../api';
import { shareQuotationPdf } from '../pdf';
import { colors } from '../theme';

// Read-only quotation detail with a "Share PDF" action. Loads config once for the
// company header / tax settings used in the generated PDF.
export default function QuotationDocumentScreen({ route }) {
  const q = route.params?.quotation || {};
  const [config, setConfig] = useState(null);
  const [sharing, setSharing] = useState(false);

  useEffect(() => { getConfig().then(setConfig).catch(() => setConfig({})); }, []);

  const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const items = Array.isArray(q.items) ? q.items : [];
  const cust = q.customer || {};

  const onShare = async () => {
    if (sharing) return;
    setSharing(true);
    try {
      await shareQuotationPdf(q, config || {});
    } catch {
      Alert.alert('Could not create PDF', 'Please try again.');
    } finally {
      setSharing(false);
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 100 }}>
        <View style={styles.card}>
          <Text style={styles.id}>{q.id}</Text>
          <Text style={styles.date}>{q.date}</Text>
          <View style={styles.divider} />
          <Text style={styles.label}>Customer</Text>
          <Text style={styles.cust}>{cust.name || '—'}</Text>
          {!!cust.phone && <Text style={styles.meta}>{cust.phone}</Text>}
          {!!cust.address && <Text style={styles.meta}>{cust.address}</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.label}>Items</Text>
          {items.map((it, i) => (
            <View key={it.cartId || it.id || i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{it.name}</Text>
                <Text style={styles.meta}>{it.qty} {it.unit || ''}{it.color ? ` · ${it.color}` : ''} @ {money(it.price)}</Text>
              </View>
              <Text style={styles.amount}>{money((Number(it.price) || 0) * (Number(it.qty) || 0))}</Text>
            </View>
          ))}
          {items.length === 0 && <Text style={styles.meta}>No items.</Text>}
          <View style={styles.divider} />
          <View style={styles.totalRow}>
            <Text style={styles.totalLabel}>Grand Total</Text>
            <Text style={styles.grand}>{money(q.grandTotal)}</Text>
          </View>
        </View>
      </ScrollView>

      <View style={styles.footer}>
        <TouchableOpacity style={[styles.shareBtn, sharing && { opacity: 0.7 }]} onPress={onShare} disabled={sharing || !config}>
          {sharing
            ? <ActivityIndicator color={colors.white} />
            : (<><Ionicons name="share-outline" size={18} color={colors.white} /><Text style={styles.shareText}>  Share PDF</Text></>)}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.line, padding: 16, marginBottom: 12 },
  id: { fontSize: 18, fontWeight: '700', color: colors.ink },
  date: { fontSize: 13, color: colors.inkSoft, marginTop: 2 },
  divider: { height: 1, backgroundColor: colors.line, marginVertical: 12 },
  label: { fontSize: 11, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', marginBottom: 6 },
  cust: { fontSize: 16, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  itemRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.line },
  itemName: { fontSize: 14, fontWeight: '600', color: colors.ink },
  amount: { fontSize: 14, fontWeight: '600', color: colors.ink, marginLeft: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  totalLabel: { fontSize: 14, fontWeight: '700', color: colors.ink },
  grand: { fontSize: 20, fontWeight: '800', color: colors.accent },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  shareBtn: { backgroundColor: colors.ink, borderRadius: 8, padding: 15, alignItems: 'center', justifyContent: 'center', flexDirection: 'row' },
  shareText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet, SectionList,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { getConfig, createQuotation } from '../api';
import { colors } from '../theme';

// Build a quotation on the phone: load the live catalogue, set quantities, enter
// the customer, then save to the cloud (same /api/quotations the PC uses, so it
// appears on every device). Item shape matches the web cart so the PC can open
// and reprint it.
export default function NewQuotationScreen({ navigation }) {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [qty, setQty] = useState({});         // varietyId -> quantity
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      try { setConfig(await getConfig()); }
      catch { setError('Could not load catalogue. Go back and retry.'); }
      finally { setLoading(false); }
    })();
  }, []);

  // Group varieties under their class for a SectionList.
  const sections = useMemo(() => {
    if (!config) return [];
    const classes = config.classes || [];
    const varieties = config.varieties || [];
    return classes
      .map(c => ({
        title: c.name,
        classId: c.id,
        data: varieties.filter(v => v.classId === c.id),
      }))
      .filter(s => s.data.length > 0);
  }, [config]);

  const settings = config?.settings || {};
  const varietyById = useMemo(() => {
    const m = {};
    (config?.varieties || []).forEach(v => { m[v.id] = v; });
    return m;
  }, [config]);

  const setQ = (id, n) => setQty(prev => {
    const next = { ...prev };
    const val = Math.max(0, Math.floor(Number(n) || 0));
    if (val <= 0) delete next[id]; else next[id] = val;
    return next;
  });

  const lines = Object.entries(qty).map(([id, q]) => {
    const v = varietyById[id];
    return v ? { v, q } : null;
  }).filter(Boolean);

  const subtotal = lines.reduce((s, { v, q }) => s + (Number(v.basePrice) || 0) * q, 0);
  const tax = settings.taxEnabled ? subtotal * (Number(settings.taxRate) || 0) / 100 : 0;
  const grandTotal = Math.round((subtotal + tax) * 100) / 100;

  const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

  const save = async () => {
    if (saving) return;
    if (!name.trim()) { Alert.alert('Customer name required'); return; }
    if (lines.length === 0) { Alert.alert('Add at least one product'); return; }
    setSaving(true);
    try {
      const prefix = settings.quotationPrefix || 'NJ-Q';
      const id = `${prefix}-${Date.now()}`;
      const today = new Date().toISOString().slice(0, 10);
      const items = lines.map(({ v, q }) => ({
        id: v.id,
        name: v.name,
        price: Number(v.basePrice) || 0,
        actualPrice: Number(v.basePrice) || 0,
        qty: q,
        unit: v.unit || '',
        color: (v.colors && v.colors[0] && v.colors[0].name) || '',
        cartId: `${v.id}-${Date.now()}`,
      }));
      const quotation = {
        id,
        date: today,
        customer: { name: name.trim(), phone: phone.trim(), email: '', address: '' },
        items,
        subtotal,
        tax,
        grandTotal,
        createdOn: 'mobile',
      };
      await createQuotation(quotation);
      Alert.alert('Saved', `Quotation ${id} created.`, [
        { text: 'OK', onPress: () => navigation.goBack() },
      ]);
    } catch {
      Alert.alert('Save failed', 'Could not save. Check your connection and try again.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;
  if (error) return <View style={styles.center}><Text style={styles.err}>{error}</Text></View>;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <SectionList
        sections={sections}
        keyExtractor={item => item.id}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={
          <View style={styles.customerCard}>
            <Text style={styles.cardTitle}>Customer</Text>
            <TextInput style={styles.input} placeholder="Name" value={name} onChangeText={setName} />
            <TextInput style={styles.input} placeholder="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
          </View>
        }
        renderSectionHeader={({ section }) => <Text style={styles.section}>{section.title}</Text>}
        renderItem={({ item }) => {
          const q = qty[item.id] || 0;
          return (
            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.meta}>{money(item.basePrice)} / {item.unit || 'unit'}</Text>
              </View>
              <View style={styles.stepper}>
                <TouchableOpacity style={styles.stepBtn} onPress={() => setQ(item.id, q - 1)}>
                  <Ionicons name="remove" size={18} color={colors.ink} />
                </TouchableOpacity>
                <TextInput
                  style={styles.qtyInput}
                  value={q ? String(q) : ''}
                  placeholder="0"
                  keyboardType="number-pad"
                  onChangeText={t => setQ(item.id, t)}
                />
                <TouchableOpacity style={styles.stepBtn} onPress={() => setQ(item.id, q + 1)}>
                  <Ionicons name="add" size={18} color={colors.ink} />
                </TouchableOpacity>
              </View>
            </View>
          );
        }}
        contentContainerStyle={{ paddingBottom: 140 }}
      />

      <View style={styles.footer}>
        <View style={{ flex: 1 }}>
          <Text style={styles.totalLabel}>{lines.length} item(s){settings.taxEnabled ? ` · incl ${settings.taxRate}% tax` : ''}</Text>
          <Text style={styles.totalValue}>{money(grandTotal)}</Text>
        </View>
        <TouchableOpacity style={[styles.saveBtn, saving && { opacity: 0.7 }]} onPress={save} disabled={saving}>
          {saving ? <ActivityIndicator color={colors.white} /> : <Text style={styles.saveText}>Save Quotation</Text>}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg, padding: 24 },
  err: { color: colors.red, textAlign: 'center' },
  customerCard: { backgroundColor: colors.surface, margin: 12, padding: 16, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, marginBottom: 10, textTransform: 'uppercase' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 10, fontSize: 15, marginBottom: 10, backgroundColor: colors.white, color: colors.ink },
  section: { paddingHorizontal: 18, paddingVertical: 8, fontSize: 13, fontWeight: '700', color: colors.ink, backgroundColor: colors.bg },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  stepper: { flexDirection: 'row', alignItems: 'center' },
  stepBtn: { width: 32, height: 32, borderRadius: 8, borderWidth: 1, borderColor: colors.line, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
  qtyInput: { width: 44, textAlign: 'center', fontSize: 15, color: colors.ink, marginHorizontal: 4, padding: 4 },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', padding: 16, backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.line },
  totalLabel: { fontSize: 12, color: colors.inkSoft },
  totalValue: { fontSize: 20, fontWeight: '700', color: colors.ink },
  saveBtn: { backgroundColor: colors.ink, borderRadius: 8, paddingHorizontal: 20, paddingVertical: 14, alignItems: 'center' },
  saveText: { color: colors.white, fontWeight: '700', fontSize: 15 },
});

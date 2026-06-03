import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, SectionList, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useAuth } from '../AuthContext';
import { getConfig } from '../api';
import { colors } from '../theme';

// Read-only catalogue browser: product classes with their varieties, prices and
// units. Auto-refreshes when the synced revision changes (e.g. the PC edits the
// catalogue), and supports pull-to-refresh.
export default function CatalogueScreen() {
  const { revision } = useAuth();
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try { setConfig(await getConfig()); setError(''); }
    catch { setError('Could not load catalogue. Pull to retry.'); }
    finally { setLoading(false); setRefreshing(false); }
  }, []);

  useEffect(() => { load(); }, [load, revision]);

  const money = (n) => '₹' + (Number(n) || 0).toLocaleString('en-IN');

  const sections = (() => {
    if (!config) return [];
    const classes = config.classes || [];
    const varieties = config.varieties || [];
    return classes.map(c => ({
      title: c.name,
      subtitle: c.subtitle || '',
      data: varieties.filter(v => v.classId === c.id),
    })).filter(s => s.data.length > 0);
  })();

  if (loading) return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;

  return (
    <SectionList
      style={{ flex: 1, backgroundColor: colors.bg }}
      sections={sections}
      keyExtractor={(it, i) => String(it.id ?? i)}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} />}
      renderSectionHeader={({ section }) => (
        <View style={styles.header}>
          <Text style={styles.headerTitle}>{section.title}</Text>
          {!!section.subtitle && <Text style={styles.headerSub}>{section.subtitle}</Text>}
        </View>
      )}
      renderItem={({ item }) => (
        <View style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{item.name}</Text>
            {!!item.description && <Text style={styles.desc} numberOfLines={1}>{item.description}</Text>}
          </View>
          <Text style={styles.price}>{money(item.basePrice)}<Text style={styles.unit}>/{item.unit || 'unit'}</Text></Text>
        </View>
      )}
      ListEmptyComponent={<View style={styles.center}><Text style={styles.empty}>{error || 'No catalogue items.'}</Text></View>}
      contentContainerStyle={sections.length === 0 ? { flex: 1 } : { paddingBottom: 16 }}
    />
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { color: colors.inkSoft },
  header: { paddingHorizontal: 16, paddingTop: 16, paddingBottom: 6, backgroundColor: colors.bg },
  headerTitle: { fontSize: 15, fontWeight: '700', color: colors.ink },
  headerSub: { fontSize: 11, color: colors.inkSoft, marginTop: 1 },
  row: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, marginHorizontal: 12, marginVertical: 4, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  desc: { fontSize: 12, color: colors.inkSoft, marginTop: 2 },
  price: { fontSize: 15, fontWeight: '700', color: colors.accent, marginLeft: 10 },
  unit: { fontSize: 11, fontWeight: '400', color: colors.inkSoft },
});

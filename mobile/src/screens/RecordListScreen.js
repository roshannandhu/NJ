import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, FlatList, StyleSheet, RefreshControl, ActivityIndicator } from 'react-native';
import { useAuth } from '../AuthContext';
import { colors } from '../theme';

// Shared list screen for quotations and warranties. `fetcher` returns the array
// of records; `subtitle` derives the secondary line per record. The list
// auto-refreshes whenever the global sync revision changes (another device made
// an edit), and supports pull-to-refresh.
export default function RecordListScreen({ fetcher, emptyText }) {
  const { revision } = useAuth();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    try {
      const rows = await fetcher();
      setItems(Array.isArray(rows) ? rows : []);
      setError('');
    } catch (e) {
      setError('Could not load. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [fetcher]);

  // Initial load + re-load whenever the synced revision changes.
  useEffect(() => { load(); }, [load, revision]);

  const onRefresh = () => { setRefreshing(true); load(); };

  const fmtMoney = (n) =>
    typeof n === 'number' ? '₹' + n.toLocaleString('en-IN') : (n || '');

  const renderItem = ({ item }) => {
    const name = item?.customer?.name || item?.customerName || 'Unnamed';
    const date = item?.date || '';
    const total = item?.grandTotal;
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name} numberOfLines={1}>{name}</Text>
          <Text style={styles.meta}>{date}{item?.id ? `  ·  ${item.id}` : ''}</Text>
        </View>
        {total != null && <Text style={styles.total}>{fmtMoney(total)}</Text>}
      </View>
    );
  };

  if (loading) {
    return <View style={styles.center}><ActivityIndicator color={colors.ink} /></View>;
  }

  return (
    <FlatList
      style={styles.list}
      data={items}
      keyExtractor={(it, i) => String(it?.id ?? i)}
      renderItem={renderItem}
      ItemSeparatorComponent={() => <View style={styles.sep} />}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
      ListEmptyComponent={
        <View style={styles.center}>
          <Text style={styles.empty}>{error || emptyText || 'Nothing yet.'}</Text>
        </View>
      }
      contentContainerStyle={items.length === 0 ? { flex: 1 } : { paddingVertical: 8 }}
    />
  );
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  empty: { color: colors.inkSoft, fontSize: 14, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 18, paddingVertical: 14, backgroundColor: colors.surface, marginHorizontal: 12, borderRadius: 10, borderWidth: 1, borderColor: colors.line },
  name: { fontSize: 15, fontWeight: '600', color: colors.ink },
  meta: { fontSize: 12, color: colors.inkSoft, marginTop: 3 },
  total: { fontSize: 15, fontWeight: '700', color: colors.accent, marginLeft: 12 },
  sep: { height: 8 },
});

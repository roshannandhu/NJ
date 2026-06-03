import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, ScrollView } from 'react-native';
import { useAuth } from '../AuthContext';
import { getBaseUrl, getConfig } from '../api';
import { colors } from '../theme';

export default function AccountScreen() {
  const { user, serverUrl, signOut, revision } = useAuth();
  const [company, setCompany] = useState(null);

  // Company details (read-only on the phone) refresh with the sync revision.
  useEffect(() => {
    getConfig().then(cfg => setCompany(cfg?.company || {})).catch(() => {});
  }, [revision]);

  return (
    <ScrollView style={styles.root} contentContainerStyle={{ padding: 16 }}>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user || '—'}</Text>

        <Text style={styles.label}>Server</Text>
        <Text style={styles.value} numberOfLines={1}>{serverUrl || getBaseUrl() || '—'}</Text>

        <Text style={styles.label}>Live sync</Text>
        <Text style={styles.value}>Connected · rev {revision}</Text>
      </View>

      {company && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Company</Text>
          <Text style={styles.value}>{company.name || '—'}</Text>
          {!!company.address && <Text style={styles.meta}>{company.address}</Text>}
          {!!company.phone && <Text style={styles.meta}>{company.phone}</Text>}
          {!!company.website && <Text style={styles.meta}>{company.website}</Text>}
        </View>
      )}

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 20, marginBottom: 12 },
  cardTitle: { fontSize: 13, fontWeight: '700', color: colors.inkSoft, textTransform: 'uppercase', marginBottom: 8 },
  label: { fontSize: 12, color: colors.inkSoft, fontWeight: '600', marginTop: 16 },
  value: { fontSize: 16, color: colors.ink, marginTop: 4 },
  meta: { fontSize: 13, color: colors.inkSoft, marginTop: 3 },
  signOut: { marginTop: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.red, padding: 14, alignItems: 'center' },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: 15 },
});

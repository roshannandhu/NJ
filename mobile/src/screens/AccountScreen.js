import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuth } from '../AuthContext';
import { getBaseUrl } from '../api';
import { colors } from '../theme';

export default function AccountScreen() {
  const { user, serverUrl, signOut, revision } = useAuth();
  return (
    <View style={styles.root}>
      <View style={styles.card}>
        <Text style={styles.label}>Signed in as</Text>
        <Text style={styles.value}>{user || '—'}</Text>

        <Text style={styles.label}>Server</Text>
        <Text style={styles.value} numberOfLines={1}>{serverUrl || getBaseUrl() || '—'}</Text>

        <Text style={styles.label}>Live sync</Text>
        <Text style={styles.value}>Connected · rev {revision}</Text>
      </View>

      <TouchableOpacity style={styles.signOut} onPress={signOut}>
        <Text style={styles.signOutText}>Sign Out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg, padding: 16 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 20 },
  label: { fontSize: 12, color: colors.inkSoft, fontWeight: '600', marginTop: 16 },
  value: { fontSize: 16, color: colors.ink, marginTop: 4 },
  signOut: { marginTop: 24, borderRadius: 8, borderWidth: 1, borderColor: colors.red, padding: 14, alignItems: 'center' },
  signOutText: { color: colors.red, fontWeight: '700', fontSize: 15 },
});

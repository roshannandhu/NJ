import React, { useEffect, useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  KeyboardAvoidingView, Platform, ActivityIndicator, ScrollView,
} from 'react-native';
import { useAuth } from '../AuthContext';
import { getBaseUrl } from '../api';
import { colors } from '../theme';

export default function LoginScreen() {
  const { signIn } = useAuth();
  const [url, setUrl] = useState('');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => { setUrl(getBaseUrl() || ''); }, []);

  const submit = async () => {
    if (busy) return;
    if (!url.trim()) { setError('Enter the server address'); return; }
    if (!username || !password) { setError('Enter username and password'); return; }
    setBusy(true); setError('');
    try {
      await signIn(url, username.trim(), password);
    } catch (e) {
      setError(
        e?.message?.includes('Network') || e?.message?.includes('fetch')
          ? 'Cannot reach that server address'
          : 'Invalid username or password'
      );
      setPassword('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <Text style={styles.brand}>NJ<Text style={{ color: colors.accent }}>.</Text></Text>
          <Text style={styles.title}>NJ India System</Text>
          <Text style={styles.subtitle}>Sign in to your account</Text>

          <Text style={styles.label}>Server address</Text>
          <TextInput
            style={styles.input}
            value={url}
            onChangeText={t => { setUrl(t); setError(''); }}
            placeholder="https://your-app.onrender.com"
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />

          <Text style={styles.label}>Username</Text>
          <TextInput
            style={styles.input}
            value={username}
            onChangeText={t => { setUsername(t); setError(''); }}
            placeholder="username"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>Password</Text>
          <TextInput
            style={[styles.input, error ? styles.inputError : null]}
            value={password}
            onChangeText={t => { setPassword(t); setError(''); }}
            placeholder="password"
            secureTextEntry
            onSubmitEditing={submit}
          />

          <TouchableOpacity style={[styles.button, busy && { opacity: 0.7 }]} onPress={submit} disabled={busy}>
            {busy ? <ActivityIndicator color={colors.white} /> : <Text style={styles.buttonText}>Sign In</Text>}
          </TouchableOpacity>

          {!!error && <Text style={styles.error}>{error}</Text>}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: 24 },
  card: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.line, padding: 24 },
  brand: { fontSize: 40, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  title: { fontSize: 20, fontWeight: '600', color: colors.ink, textAlign: 'center', marginTop: 4 },
  subtitle: { fontSize: 13, color: colors.inkSoft, textAlign: 'center', marginBottom: 20 },
  label: { fontSize: 12, color: colors.inkSoft, marginBottom: 6, marginTop: 12, fontWeight: '600' },
  input: { borderWidth: 1, borderColor: colors.line, borderRadius: 8, padding: 12, fontSize: 15, color: colors.ink, backgroundColor: colors.white },
  inputError: { borderColor: colors.red },
  button: { backgroundColor: colors.ink, borderRadius: 8, padding: 14, alignItems: 'center', marginTop: 22 },
  buttonText: { color: colors.white, fontWeight: '700', fontSize: 15 },
  error: { color: colors.red, fontSize: 13, marginTop: 12, textAlign: 'center' },
});

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AuthProvider, useAuth } from './src/AuthContext';
import LoginScreen from './src/screens/LoginScreen';
import QuotationsScreen from './src/screens/QuotationsScreen';
import NewQuotationScreen from './src/screens/NewQuotationScreen';
import WarrantiesScreen from './src/screens/WarrantiesScreen';
import AccountScreen from './src/screens/AccountScreen';
import { colors } from './src/theme';

const Tab = createBottomTabNavigator();
const QStack = createNativeStackNavigator();

const ICONS = {
  Quotations: 'document-text-outline',
  Warranties: 'shield-checkmark-outline',
  Account: 'person-circle-outline',
};

const stackHeader = {
  headerStyle: { backgroundColor: colors.ink },
  headerTintColor: colors.white,
  headerTitleStyle: { fontWeight: '700' },
};

function QuotationsStack() {
  return (
    <QStack.Navigator screenOptions={stackHeader}>
      <QStack.Screen
        name="QuotationsList"
        component={QuotationsScreen}
        options={({ navigation }) => ({
          title: 'Quotations',
          headerRight: () => (
            <TouchableOpacity onPress={() => navigation.navigate('NewQuotation')} hitSlop={12}>
              <Ionicons name="add" size={26} color={colors.white} />
            </TouchableOpacity>
          ),
        })}
      />
      <QStack.Screen name="NewQuotation" component={NewQuotationScreen} options={{ title: 'New Quotation' }} />
    </QStack.Navigator>
  );
}

function Tabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: { backgroundColor: colors.ink },
        headerTintColor: colors.white,
        headerTitleStyle: { fontWeight: '700' },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.inkSoft,
        tabBarIcon: ({ color, size }) => (
          <Ionicons name={ICONS[route.name] || 'ellipse-outline'} size={size} color={color} />
        ),
      })}
    >
      <Tab.Screen name="Quotations" component={QuotationsStack} options={{ headerShown: false }} />
      <Tab.Screen name="Warranties" component={WarrantiesScreen} />
      <Tab.Screen name="Account" component={AccountScreen} />
    </Tab.Navigator>
  );
}

function Root() {
  const { ready, signedIn } = useAuth();
  if (!ready) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.ink} size="large" />
      </View>
    );
  }
  return (
    <NavigationContainer>
      {signedIn ? <Tabs /> : <LoginScreen />}
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <AuthProvider>
        <Root />
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.bg },
});

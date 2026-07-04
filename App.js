import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, Text } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { initDb } from './src/database/db';
import useStore from './src/store/useStore';

// Screens - Auth
import LoginScreen from './src/screens/Auth/LoginScreen';
import RegisterScreen from './src/screens/Auth/RegisterScreen';
import ForgotPasswordScreen from './src/screens/Auth/ForgotPasswordScreen';

// Screens - Setup
import PeriodSetupScreen from './src/screens/Setup/PeriodSetupScreen';

// Screens - Dashboard (Tabs)
import HomeScreen from './src/screens/Dashboard/HomeScreen';
import StudentListScreen from './src/screens/Dashboard/StudentListScreen';
import ClassScreen from './src/screens/Dashboard/ClassScreen';
import AttendanceScreen from './src/screens/Dashboard/AttendanceScreen';
import GradesScreen from './src/screens/Dashboard/GradesScreen';
import SettingsScreen from './src/screens/Dashboard/SettingsScreen';

// Screens - Dashboard (Stack/Push)
import ClassDetailScreen from './src/screens/Dashboard/ClassDetailScreen';

const Stack = createNativeStackNavigator();
const Tab = createBottomTabNavigator();

function DashboardTabs() {
  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          if (route.name === 'Beranda') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Siswa') {
            iconName = focused ? 'people' : 'people-outline';
          } else if (route.name === 'Kelas') {
            iconName = focused ? 'business' : 'business-outline';
          } else if (route.name === 'Absensi') {
            iconName = focused ? 'calendar' : 'calendar-outline';
          } else if (route.name === 'Nilai') {
            iconName = focused ? 'bar-chart' : 'bar-chart-outline';
          } else if (route.name === 'Pengaturan') {
            iconName = focused ? 'settings' : 'settings-outline';
          }
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: '#2563eb',
        tabBarInactiveTintColor: '#94a3b8',
        tabBarStyle: {
          backgroundColor: '#fff',
          borderTopWidth: 1,
          borderTopColor: '#e2e8f0',
          paddingBottom: 8,
          paddingTop: 8,
        },
        tabBarLabelStyle: {
          fontSize: 10,
          fontWeight: '600',
        },
        headerStyle: {
          backgroundColor: '#1d4ed8',
        },
        headerTintColor: '#fff',
        headerTitleStyle: {
          fontWeight: 'bold',
          fontSize: 17,
        },
      })}
    >
      <Tab.Screen
        name="Beranda"
        component={HomeScreen}
        options={{ title: 'Beranda' }}
      />
      <Tab.Screen
        name="Siswa"
        component={StudentListScreen}
        options={{ title: 'Siswa' }}
      />
      <Tab.Screen
        name="Kelas"
        component={ClassScreen}
        options={{ title: 'Kelas' }}
      />
      <Tab.Screen
        name="Absensi"
        component={AttendanceScreen}
        options={{ title: 'Absensi' }}
      />
      <Tab.Screen
        name="Nilai"
        component={GradesScreen}
        options={{ title: 'Nilai' }}
      />
      <Tab.Screen
        name="Pengaturan"
        component={SettingsScreen}
        options={{ title: 'Pengaturan' }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  const [isDbReady, setIsDbReady] = useState(false);
  const [dbError, setDbError] = useState(null);
  const user = useStore((state) => state.user);
  const activePeriod = useStore((state) => state.activePeriod);

  useEffect(() => {
    const setup = async () => {
      try {
        await initDb();
        setIsDbReady(true);
      } catch (error) {
        console.error('Gagal inisialisasi database:', error);
        setDbError(error.message);
      }
    };
    setup();
  }, []);

  if (dbError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Ionicons name="warning-outline" size={48} color="#ef4444" />
        <Text style={{ fontSize: 16, fontWeight: 'bold', color: '#0f172a', marginTop: 12 }}>
          Gagal Memuat Database
        </Text>
        <Text style={{ color: '#64748b', marginTop: 8, textAlign: 'center' }}>{dbError}</Text>
      </View>
    );
  }

  if (!isDbReady) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#1d4ed8' }}>
        <Ionicons name="school" size={56} color="#fff" />
        <Text style={{ color: '#fff', fontSize: 24, fontWeight: 'bold', marginTop: 16 }}>EduPresensi</Text>
        <ActivityIndicator size="large" color="#bfdbfe" style={{ marginTop: 24 }} />
        <Text style={{ color: '#bfdbfe', marginTop: 12, fontSize: 14 }}>Menyiapkan database...</Text>
      </View>
    );
  }

  return (
    <SafeAreaProvider>
      <NavigationContainer>
        <Stack.Navigator
          initialRouteName={user ? (activePeriod ? 'Dashboard' : 'PeriodSetup') : 'Login'}
          screenOptions={{ headerShown: false }}
        >
          {/* Auth Screens */}
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Register" component={RegisterScreen} />
          <Stack.Screen name="ForgotPassword" component={ForgotPasswordScreen} />

          {/* Setup */}
          <Stack.Screen name="PeriodSetup" component={PeriodSetupScreen} />

          {/* Dashboard Tabs */}
          <Stack.Screen name="Dashboard" component={DashboardTabs} />

          {/* Push Screens (dari dalam tab) */}
          <Stack.Screen
            name="ClassDetail"
            component={ClassDetailScreen}
            options={({ route }) => ({
              headerShown: true,
              title: route.params?.nama_kelas || 'Detail Kelas',
              headerStyle: { backgroundColor: '#1d4ed8' },
              headerTintColor: '#fff',
              headerTitleStyle: { fontWeight: 'bold' },
            })}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}

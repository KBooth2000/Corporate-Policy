import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.intellidrift.companypolicy',
  appName: 'Company Policy',
  webDir: 'dist',
  backgroundColor: '#101418',
  android: {
    backgroundColor: '#101418',
    allowMixedContent: false,
    webContentsDebuggingEnabled: false,
  },
  server: {
    androidScheme: 'https',
  },
};

export default config;

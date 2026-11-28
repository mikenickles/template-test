import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.familyfridge.app',
  appName: 'Family Fridge',
  webDir: 'dist',
  backgroundColor: '#EDEFF3',
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: {
      launchShowDuration: 900,
      launchAutoHide: true,
      backgroundColor: '#EDEFF3',
      showSpinner: false
    },
    SystemBars: {
      insetsHandling: 'css',
      initialViewportFitValueHint: 'cover',
      style: 'LIGHT'
    }
  }
};

export default config;

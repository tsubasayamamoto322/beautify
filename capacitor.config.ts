import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.yama.beautify',
  appName: 'Beautify',
  webDir: '.output/public',
  ios: {
    contentInset: 'always',  
  },
};

export default config;

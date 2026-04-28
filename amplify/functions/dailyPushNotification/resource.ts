import { defineFunction, secret } from '@aws-amplify/backend';

export const dailyPushNotification = defineFunction({
  name: 'dailyPushNotification',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 256,
  resourceGroupName: 'data',
  runtime: 22,
  environment: {
    APNS_KEY_ID:          '23PYA5PDLB',
    APNS_TEAM_ID:         '7C69RC5J55',
    APNS_BUNDLE_ID:       'com.yama.beautify',
    APNS_PRIVATE_KEY_DER: secret('APNS_PRIVATE_KEY_DER'),
  },
});

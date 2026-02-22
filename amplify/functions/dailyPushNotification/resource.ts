import { defineFunction, secret } from '@aws-amplify/backend';

export const dailyPushNotification = defineFunction({
  name: 'dailyPushNotification',
  entry: './handler.ts',
  timeoutSeconds: 60,
  memoryMB: 256,
  resourceGroupName: 'data',   // ← data スタックに割り当てて循環依存を解消
  environment: {
    VAPID_PUBLIC_KEY:  process.env.VITE_VAPID_PUBLIC_KEY ?? '',
    VAPID_SUBJECT:     'mailto:tsubasa322322@gmail.com',
    VAPID_PRIVATE_KEY: secret('VAPID_PRIVATE_KEY'),
  },
});

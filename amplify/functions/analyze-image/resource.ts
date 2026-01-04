import { defineFunction } from '@aws-amplify/backend';

export const analyzeImage = defineFunction({
  name: 'analyze-image',
  entry: './handler.ts',
  timeoutSeconds: 60, // AIの解析には時間がかかるので長めに設定
});
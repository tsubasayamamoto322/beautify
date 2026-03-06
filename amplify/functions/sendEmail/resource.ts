import { defineFunction } from '@aws-amplify/backend';

export const sendEmail = defineFunction({
  name: 'sendEmail',
  entry: './handler.ts',
  timeoutSeconds: 30,
  resourceGroupName: 'data',
  environment: {
    SES_FROM_EMAIL: 'tsubasa322322@gmail.com',
  },
});
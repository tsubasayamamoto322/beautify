/**
 * amplify/backend.ts
 */

import { defineBackend }                from '@aws-amplify/backend';
import { auth }                         from './auth/resource';
import { data }                         from './data/resource';
import { storage }                      from './storage/resource';
import { analyzeImage }                 from './functions/analyze-image/resource';
import { dailyPushNotification }        from './functions/dailyPushNotification/resource';
import { Stack }                        from 'aws-cdk-lib';
import { Schedule, ScheduleExpression } from 'aws-cdk-lib/aws-scheduler';
import { LambdaInvoke }                 from 'aws-cdk-lib/aws-scheduler-targets';

const backend = defineBackend({ auth, data, storage, analyzeImage, dailyPushNotification });

// ── analyze-image に S3 バケット名と読み取り権限を付与 ─────────────
const s3Bucket = backend.storage.resources.bucket;

backend.analyzeImage.addEnvironment('BUCKET_NAME', s3Bucket.bucketName);
s3Bucket.grantRead(backend.analyzeImage.resources.lambda);

// ── dailyPushNotification に DynamoDB 権限を付与 ──────────────────
const tables = backend.data.resources.tables;
const lambdaFn = backend.dailyPushNotification.resources.lambda;

backend.dailyPushNotification.addEnvironment('COSMETIC_TABLE',     tables['Cosmetic'].tableName);
backend.dailyPushNotification.addEnvironment('SUBSCRIPTION_TABLE', tables['PushSubscription'].tableName);
backend.dailyPushNotification.addEnvironment('SETTINGS_TABLE',     tables['UserSettings'].tableName);

tables['Cosmetic'].grantReadData(lambdaFn);
tables['PushSubscription'].grantReadData(lambdaFn);
tables['UserSettings'].grantReadData(lambdaFn);

// ── EventBridge Scheduler：毎時 0 分に起動 ────────────────────────
const stack = Stack.of(lambdaFn);

new Schedule(stack, 'BeautifyHourlyCheck', {
  schedule: ScheduleExpression.cron({
    minute: '0',
    hour:   '*',
    day:    '*',
    month:  '*',
    year:   '*',
  }),
  target: new LambdaInvoke(lambdaFn, { retryAttempts: 1 }),
  description: 'Beautify 毎時チェック - ユーザー指定時刻にプッシュ通知',
});

export default backend;

/**
 * Beautify - 毎時起動・ユーザーごとの指定時刻にプッシュ通知 Lambda
 */

import { DynamoDBClient, ScanCommand, AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import webpush from 'web-push';

const dynamo = new DynamoDBClient({});
const LOW_STOCK_THRESHOLD = 0.20;

webpush.setVapidDetails(
  process.env.VAPID_SUBJECT!,
  process.env.VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!,
);

function isNotifyTime(notifyTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: timezone,
      hour:   '2-digit',
      minute: '2-digit',
      hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hh = parts.find(p => p.type === 'hour')?.value   ?? '00';
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
    return `${hh}:${mm}` === notifyTime;
  } catch {
    return false;
  }
}

export const handler = async (): Promise<void> => {
  console.log('[DailyPush] 起動');

  // ── 1. UserSettings を取得 ─────────────────────────────────────
  const settingsRes = await dynamo.send(new ScanCommand({
    TableName: process.env.SETTINGS_TABLE!,
  }));

  type UserSetting = { owner: string; notifyTime: string; timezone: string; notifyEnabled: boolean };
  const allSettings = (settingsRes.Items ?? []).map(
    (i: Record<string, AttributeValue>) => unmarshall(i) as UserSetting
  );

  const targetOwners = new Set(
    allSettings
      .filter(s => s.notifyEnabled && isNotifyTime(s.notifyTime, s.timezone))
      .map(s => s.owner)
  );

  if (targetOwners.size === 0) {
    console.log('[DailyPush] 今の時刻に通知対象のユーザーなし。終了。');
    return;
  }
  console.log(`[DailyPush] 通知対象ユーザー候補: ${targetOwners.size}人`);

  // ── 2. 残量 20% 以下のコスメをユーザーごとにまとめる ─────────────
  const cosmeticsRes = await dynamo.send(new ScanCommand({
    TableName: process.env.COSMETIC_TABLE!,
  }));

  type CosmeticItem = { id: string; owner: string; name: string; currentAmount: number; totalCapacity: number };
  const cosmetics = (cosmeticsRes.Items ?? []).map(
    (i: Record<string, AttributeValue>) => unmarshall(i) as CosmeticItem
  );

  const lowStockByOwner = new Map<string, string[]>();
  for (const item of cosmetics) {
    if (!targetOwners.has(item.owner)) continue;
    if (!item.totalCapacity || item.currentAmount == null) continue;
    if (item.currentAmount / item.totalCapacity <= LOW_STOCK_THRESHOLD) {
      if (!lowStockByOwner.has(item.owner)) lowStockByOwner.set(item.owner, []);
      lowStockByOwner.get(item.owner)!.push(item.name);
    }
  }

  if (lowStockByOwner.size === 0) {
    console.log('[DailyPush] 残量アラート対象なし。終了。');
    return;
  }

  // ── 3. Push サブスクリプションを取得 ──────────────────────────
  const subsRes = await dynamo.send(new ScanCommand({
    TableName: process.env.SUBSCRIPTION_TABLE!,
  }));

  type PushSub = { owner: string; endpoint: string; p256dh: string; auth: string };
  const subscriptions = (subsRes.Items ?? []).map(
    (i: Record<string, AttributeValue>) => unmarshall(i) as PushSub
  );

  // ── 4. 通知送信 ────────────────────────────────────────────────
  const sends: Promise<void>[] = [];
  for (const [owner, itemNames] of lowStockByOwner.entries()) {
    const userSubs = subscriptions.filter(s => s.owner === owner);
    if (!userSubs.length) continue;

    const payload = JSON.stringify({
      title: '⚠️ Beautify - 残量アラート',
      body:  `${itemNames.join('、')} がもうすぐなくなります。補充を検討してください！`,
      tag:   `beautify-daily-${Date.now()}`,
      url:   '/',
    });

    for (const sub of userSubs) {
      sends.push(
        webpush.sendNotification(
          { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
          payload,
        ).then(() => {
          console.log(`[DailyPush] 送信成功 owner=${owner}`);
        }).catch((err: { statusCode?: number }) => {
          console.error(`[DailyPush] 送信失敗 owner=${owner}:`, err.statusCode);
        })
      );
    }
  }

  await Promise.allSettled(sends);
  console.log('[DailyPush] 完了');
};

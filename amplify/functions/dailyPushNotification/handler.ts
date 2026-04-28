/**
 * Beautify - 毎時起動・APNs でプッシュ通知 Lambda
 */

import { DynamoDBClient, ScanCommand, AttributeValue } from '@aws-sdk/client-dynamodb';
import { unmarshall } from '@aws-sdk/util-dynamodb';
import * as http2 from 'http2';
import * as crypto from 'crypto';

const dynamo = new DynamoDBClient({});
const LOW_STOCK_THRESHOLD = 0.20;

const APNS_KEY_ID         = process.env.APNS_KEY_ID!;
const APNS_TEAM_ID        = process.env.APNS_TEAM_ID!;
const APNS_BUNDLE_ID      = process.env.APNS_BUNDLE_ID!;
const APNS_PRIVATE_KEY_DER = process.env.APNS_PRIVATE_KEY_DER!;
const APNS_HOST           = 'https://api.sandbox.push.apple.com'; // 本番APNs

function isNotifyTime(notifyTime: string, timezone: string): boolean {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('ja-JP', {
      timeZone: timezone, hour: '2-digit', minute: '2-digit', hour12: false,
    });
    const parts = formatter.formatToParts(now);
    const hh = parts.find(p => p.type === 'hour')?.value   ?? '00';
    const mm = parts.find(p => p.type === 'minute')?.value ?? '00';
    const currentTime = `${hh}:${mm}`;
    console.log(`[isNotifyTime] 現在時刻=${currentTime} 設定時刻=${notifyTime} timezone=${timezone} 一致=${currentTime === notifyTime}`);
    return currentTime === notifyTime;
  } catch { return false; }
}

function base64url(buf: Buffer): string {
  return buf.toString('base64').replace(/[+]/g, '-').replace(/[/]/g, '_').replace(/[=]/g, '');
}

function generateJwt(): string {
  const header  = base64url(Buffer.from(JSON.stringify({ alg: 'ES256', kid: APNS_KEY_ID })));
  const payload = base64url(Buffer.from(JSON.stringify({ iss: APNS_TEAM_ID, iat: Math.floor(Date.now() / 1000) })));
  const data = `${header}.${payload}`;

  const sign = crypto.createSign('SHA256');
  sign.update(data);

  const keyDer = Buffer.from(APNS_PRIVATE_KEY_DER, 'base64');
  const sig = sign.sign({ key: keyDer, format: 'der', type: 'sec1' });

  // DER形式をieee-p1363形式に変換
  let offset = 2;
  offset++; // INTEGER tag
  const rLen = sig[offset++];
  const rBytes = sig.slice(offset, offset + rLen);
  offset += rLen;
  offset++; // INTEGER tag
  const sLen = sig[offset++];
  const sBytes = sig.slice(offset, offset + sLen);

  const rClean = rBytes[0] === 0 ? rBytes.slice(1) : rBytes;
  const sClean = sBytes[0] === 0 ? sBytes.slice(1) : sBytes;
  const rPad = Buffer.alloc(32);
  const sPad = Buffer.alloc(32);
  rClean.copy(rPad, 32 - rClean.length);
  sClean.copy(sPad, 32 - sClean.length);

  return `${data}.${base64url(Buffer.concat([rPad, sPad]))}`;
}

function sendApnsWithClient(deviceToken: string, title: string, body: string, jwt: string, client: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: 'default', badge: 1 }
    });

    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${deviceToken}`,
      'authorization': `bearer ${jwt}`,
      'apns-topic': APNS_BUNDLE_ID,
      'apns-push-type': 'alert',
      'apns-priority': '10',
      'content-type': 'application/json',
      'content-length': String(Buffer.byteLength(payload)),
    });

    req.write(payload);
    req.end();

    let status = 0;
    let responseData = '';
    const timeout = setTimeout(() => { reject(new Error('APNs timeout')); }, 10000);

    req.on('response', (headers: any) => {
      status = headers[':status'] as number;
    });
    req.on('data', (chunk: any) => { responseData += chunk; });
    req.on('end', () => {
      clearTimeout(timeout);
      if (status === 200) resolve();
      else reject(new Error(`APNs error ${status}: ${responseData}`));
    });
    req.on('error', (err: any) => { clearTimeout(timeout); reject(err); });
  });
}

export const handler = async (): Promise<void> => {
  console.log('[DailyPush] 起動');

  // ── 1. UserSettings を取得 ──────────────────────────────────
  const settingsRes = await dynamo.send(new ScanCommand({ TableName: process.env.SETTINGS_TABLE! }));
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
    console.log('[DailyPush] 通知対象なし。終了。');
    return;
  }
  console.log(`[DailyPush] 通知対象: ${targetOwners.size}人`);

  // ── 2. 残量20%以下のコスメを取得 ──────────────────────────
  const cosmeticsRes = await dynamo.send(new ScanCommand({ TableName: process.env.COSMETIC_TABLE! }));
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

  // ── 3. デバイストークンを取得 ─────────────────────────────
  const subsRes = await dynamo.send(new ScanCommand({ TableName: process.env.SUBSCRIPTION_TABLE! }));
  type PushSub = { owner: string; endpoint: string };
  const subscriptions = (subsRes.Items ?? []).map(
    (i: Record<string, AttributeValue>) => unmarshall(i) as PushSub
  );

  // ── 4. APNs通知送信 ──────────────────────────────────────
  const jwt = generateJwt();
  const apnsClient = (http2 as any).connect(APNS_HOST);
  await new Promise(r => apnsClient.on('connect', r));

  const sends: Promise<void>[] = [];

  for (const [owner, itemNames] of lowStockByOwner.entries()) {
    const userSubs = subscriptions.filter(s => s.owner === owner);
    if (!userSubs.length) continue;

    const title = '⚠️ Beautify - 残量アラート';
    const body  = `${itemNames.join('、')} がもうすぐなくなります`;

    for (const sub of userSubs) {
      sends.push(
        sendApnsWithClient(sub.endpoint, title, body, jwt, apnsClient)
          .then(() => console.log(`[DailyPush] 送信成功 owner=${owner}`))
          .catch(err => console.error(`[DailyPush] 送信失敗 owner=${owner}:`, err.message))
      );
    }
  }

  await Promise.allSettled(sends);
  apnsClient.close();
  console.log('[DailyPush] 完了');
};

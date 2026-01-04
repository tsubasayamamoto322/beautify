import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { analyzeImage } from '../functions/analyze-image/resource'; // 関数をインポート

const schema = a.schema({
  // 既存のコスメモデル
  Cosmetic: a
    .model({
      name: a.string().required(),
      brand: a.string(),
      totalCapacity: a.float(),
      unit: a.string(),
      usagePerApp: a.float(),
      currentAmount: a.float(),
      imageUrl: a.string(),
    })
    .authorization((allow) => [
      allow.owner(),
    ]),

  // ✨ ここが新機能！「画像解析」というAPIを追加
  analyzeImage: a
    .query()
    .arguments({ imageKey: a.string().required() }) // 引数: 画像の場所
    .returns(a.json()) // 戻り値: JSONデータ
    .authorization((allow) => [allow.authenticated()]) // ログインユーザーのみ実行可能
    .handler(a.handler.function(analyzeImage)), // 実体はこの関数
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});
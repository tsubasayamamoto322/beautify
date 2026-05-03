import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { analyzeImage } from '../functions/analyze-image/resource';
import { sendEmail } from '../functions/sendEmail/resource';

const schema = a.schema({
  Cosmetic: a
    .model({
      name:          a.string().required(),
      brand:         a.string(),
      totalCapacity: a.float(),
      unit:          a.string(),
      usagePerApp:   a.float(),
      timesPerDay:   a.float(),
      currentAmount: a.float(),
      imageUrl:      a.string(),
      autoDeduct:    a.boolean(),
      lastDeductedAt: a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  PushSubscription: a
    .model({
      endpoint:  a.string().required(),
      p256dh:    a.string(),
      auth:      a.string(),
      userAgent: a.string(),
      platform:  a.string(),
    })
    .authorization((allow) => [allow.owner()]),

  UserSettings: a
    .model({
      notifyTime:    a.string().required(),
      timezone:      a.string().required(),
      notifyEnabled: a.boolean().required(),
    })
    .authorization((allow) => [allow.owner()]),

  analyzeImage: a
    .query()
    .arguments({ imageKey: a.string().required() })
    .returns(a.json())
    .authorization((allow) => [allow.authenticated()])
    .handler(a.handler.function(analyzeImage)),

  sendEmail: a
    .query()
    .arguments({
      toEmail:   a.string().required(),
      emailType: a.string().required(),
    })
    .returns(a.json())
    .authorization((allow) => [allow.guest()])
    .handler(a.handler.function(sendEmail)),
});

export type Schema = ClientSchema<typeof schema>;

export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: 'userPool',
  },
});

import { defineStorage } from '@aws-amplify/backend';

export const storage = defineStorage({
  name: 'beautifyDrive',
  access: (allow) => ({
    'images/*': [
      allow.authenticated.to(['read', 'write']), // ログインユーザーは読み書きOK
      allow.guest.to(['read']) // ゲストは見るだけOK
    ]
  })
});
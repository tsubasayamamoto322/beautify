import { defineAuth } from '@aws-amplify/backend';

export const auth = defineAuth({
  loginWith: {
    email: {
      verificationEmailStyle: 'CODE',
      verificationEmailSubject: 'Beautify - メールアドレスの確認',
      verificationEmailBody: (createCode) =>
        `Beautifyにご登録いただきありがとうございます。\n\n確認コード: ${createCode()}\n\nこのコードは10分間有効です。`,
    },
  },
  senders: {
    email: {
      fromEmail: 'beautify.forcontact@gmail.com',
    },
  },
});

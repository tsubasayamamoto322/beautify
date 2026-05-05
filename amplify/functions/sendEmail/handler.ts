import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const ses = new SESClient({ region: 'ap-northeast-1' });
const FROM_ADDRESS = process.env.SES_FROM_EMAIL!;

// Cognito Post Confirmation トリガー または AppSync クエリ両対応
export const handler = async (event: any) => {
  console.log('sendEmail event:', JSON.stringify(event));

  let toEmail: string;
  let emailType: string;

  // Cognito トリガーの場合
  if (event.triggerSource) {
    toEmail = event.request.userAttributes.email;
    emailType = event.triggerSource === 'PostConfirmation_ConfirmSignUp'
      ? 'welcome'
      : 'password_changed';
  } else {
    // AppSync クエリの場合
    toEmail = event.arguments.toEmail;
    emailType = event.arguments.emailType;
  }

  const { subject, html } = buildEmail(toEmail, emailType);

  try {
    await ses.send(new SendEmailCommand({
      Source: FROM_ADDRESS,
      Destination: { ToAddresses: [toEmail] },
      Message: {
        Subject: { Data: subject, Charset: 'UTF-8' },
        Body: { Html: { Data: html, Charset: 'UTF-8' } },
      },
    }));
    console.log(`[sendEmail] 送信完了 → ${toEmail} (${emailType})`);
  } catch (e) {
    console.error('[sendEmail] 送信失敗:', e);
  }

  // Cognito トリガーの場合はeventをそのまま返す必要がある
  return event;
};

function buildEmail(toEmail: string, type: string) {
  if (type === 'welcome') {
    return {
      subject: '【Beautify】ご登録ありがとうございます ✿',
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff8fa;border-radius:24px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#3DB88A,#5ECFA8);padding:40px 32px;text-align:center;">
            <div style="font-size:3rem;margin-bottom:8px;">✿</div>
            <h1 style="color:white;font-size:1.8rem;margin:0;font-family:Georgia,serif;">Beautify</h1>
            <p style="color:rgba(255,255,255,0.85);margin:8px 0 0;font-size:0.9rem;">あなたのコスメを、賢く管理</p>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#333;font-size:1.2rem;margin:0 0 16px;">ご登録ありがとうございます！</h2>
            <p style="color:#666;line-height:1.7;margin:0 0 24px;">
              Beautify へようこそ。<br>
              コスメの残量を記録して、なくなる前にお知らせします。
            </p>
            <div style="background:white;border-radius:16px;padding:20px;border:1px solid #B8E8D8;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#3DB88A;">📷 まず最初にやること</p>
              <p style="margin:0;color:#666;font-size:0.9rem;line-height:1.6;">
                コスメのパッケージを撮影するだけ。<br>
                AIが自動でブランド名・容量を読み取ります。
              </p>
            </div>
            <p style="color:#aaa;font-size:0.78rem;text-align:center;margin:0;">このメールはBeautifyから自動送信されています。</p>
          </div>
        </div>
      `,
    };
  } else {
    return {
      subject: '【Beautify】パスワードが変更されました 🔐',
      html: `
        <div style="font-family:'Helvetica Neue',Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff8fa;border-radius:24px;overflow:hidden;">
          <div style="background:linear-gradient(135deg,#3DB88A,#5ECFA8);padding:40px 32px;text-align:center;">
            <div style="font-size:3rem;margin-bottom:8px;">✿</div>
            <h1 style="color:white;font-size:1.8rem;margin:0;font-family:Georgia,serif;">Beautify</h1>
          </div>
          <div style="padding:32px;">
            <h2 style="color:#333;font-size:1.2rem;margin:0 0 16px;">パスワードが変更されました</h2>
            <p style="color:#666;line-height:1.7;margin:0 0 24px;">
              あなたのアカウントのパスワードが変更されました。<br>
              ご自身で変更された場合は、このメールは無視してください。
            </p>
            <div style="background:#fff1f1;border-radius:16px;padding:20px;border:1px solid #ffcdd2;margin-bottom:24px;">
              <p style="margin:0 0 8px;font-weight:bold;color:#e53935;">⚠️ 心当たりがない場合</p>
              <p style="margin:0;color:#666;font-size:0.9rem;line-height:1.6;">すぐにパスワードを再変更してください。</p>
            </div>
            <p style="color:#aaa;font-size:0.78rem;text-align:center;margin:0;">このメールはBeautifyから自動送信されています。</p>
          </div>
        </div>
      `,
    };
  }
}

import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

const bedrock = new BedrockRuntimeClient({ region: "us-east-1" });
const s3 = new S3Client({});

export const handler = async (event: any) => {
  console.log("Event received:", JSON.stringify(event));
  
  const { imageKey } = event.arguments;
  const bucketName = process.env.BUCKET_NAME;

  if (!bucketName || !imageKey) {
    throw new Error("Bucket name or Image key is missing");
  }

  try {
    // 1. S3から画像データを取得
    const s3Response = await s3.send(new GetObjectCommand({
      Bucket: bucketName,
      Key: imageKey,
    }));
    
    const byteArray = await s3Response.Body?.transformToByteArray();
    if (!byteArray) throw new Error("Failed to read image from S3");
    const base64Image = Buffer.from(byteArray).toString('base64');

    const extension = imageKey.split('.').pop()?.toLowerCase();
    let mediaType = "image/jpeg";
    if (extension === "png")  mediaType = "image/png";
    if (extension === "webp") mediaType = "image/webp";
    if (extension === "gif")  mediaType = "image/gif";

    // 2. 日本のコスメパッケージに特化した精度の高いプロンプト
    const prompt = `
あなたは日本の化粧品・スキンケア製品のパッケージを解析する専門家です。
この画像に写っている製品のパッケージから、以下の情報を正確に読み取ってください。

【抽出ルール】

■ brand（ブランド名）
- パッケージ上部や目立つ位置にあるブランド名を抽出
- 例: SHISEIDO, KOSÉ, KANEBO, sk-ii, NIVEA, Cetaphil, innisfree, LANEIGE
- 見つからない場合は null

■ name（製品名）
- ブランド名を除いた製品固有の名前
- 例: 化粧水, モイスチャーミルク, エッセンス, クリーム, 美容液
- シリーズ名も含めてよい（例: "エリクシール ホワイト クリアローション"）

■ totalCapacity（容量の数値のみ）
- パッケージに記載された容量の【数値だけ】を抽出
- 必ず探す場所: 底面、側面、ラベルの端、成分表の近く
- よくある表記パターン:
  * "150mL" → 150
  * "150ml" → 150  
  * "150 mL" → 150
  * "150g" → 150
  * "150G" → 150
  * "150㎖" → 150
  * "内容量 150mL" → 150
  * "NET 150mL" → 150
  * "150mL/5.0 fl.oz" → 150（最初の数値）
- 複数の容量表記がある場合はml/mLの値を優先
- 見つからない場合は null

■ unit（単位）
- 容量の単位テキストをそのまま抽出
- 例: "mL", "ml", "g", "G", "㎖", "fl.oz"
- 見つからない場合は null

【重要な注意事項】
- SPF値（例: SPF50）は容量ではありません
- PA値（例: PA+++）は容量ではありません  
- 価格（例: ¥3,300）は容量ではありません
- 製品コード・JANコードは容量ではありません
- 容量が画像に写っていない場合は正直に null を返してください

【出力形式】
必ず以下のJSON形式のみで回答してください。説明文や前置きは一切不要です。

{
  "brand": "ブランド名 or null",
  "name": "製品名",
  "totalCapacity": 数値 or null,
  "unit": "単位 or null"
}
`;

    // 3. AIへ送信
    const bedrockResponse = await bedrock.send(new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType,
                  data: base64Image,
                },
              },
              { type: "text", text: prompt },
            ],
          }
        ],
      }),
    }));

    // 4. 結果の受け取りと整形
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const resultText = responseBody.content[0].text;
    console.log("Raw AI response:", resultText);

    // JSON部分だけ抽出してパース
    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in AI response");

    const parsed = JSON.parse(jsonMatch[0]);

    // totalCapacity が文字列で来た場合は数値に変換
    if (parsed.totalCapacity && typeof parsed.totalCapacity === 'string') {
      const num = parseFloat(parsed.totalCapacity.replace(/[^\d.]/g, ''));
      parsed.totalCapacity = isNaN(num) ? null : num;
    }

    console.log("Parsed result:", JSON.stringify(parsed));
    return parsed;

  } catch (error) {
    console.error("Error details:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AI Error Details: ${errorMessage}`);
  }
};

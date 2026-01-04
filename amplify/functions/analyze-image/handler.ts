import { BedrockRuntimeClient, InvokeModelCommand } from "@aws-sdk/client-bedrock-runtime";
import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";

// AWSクライアントの初期化 (東京リージョン)
const bedrock = new BedrockRuntimeClient({ region: "ap-northeast-1" });
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

    // ✨ 修正ポイント: 画像の拡張子から、正しいメディアタイプを判断する
    const extension = imageKey.split('.').pop()?.toLowerCase();
    let mediaType = "image/jpeg"; // デフォルト
    if (extension === "png") {
      mediaType = "image/png";
    } else if (extension === "webp") {
      mediaType = "image/webp";
    } else if (extension === "gif") {
      mediaType = "image/gif";
    }

    // 2. Claude 3 (Haiku) への指示
    const prompt = `
      Analyze this image of a cosmetic product.
      Extract the following details from the packaging text:
      
      1. "brand": The brand name (e.g., NIVEA, SHISEIDO). If not found, use null.
      2. "name": The product name (e.g., Skin Conditioner, Milky Lotion).
      3. "totalCapacity": The numeric volume/weight (e.g., for "50ml", extract 50). If not found, use null.
      4. "unit": The unit text (e.g., ml, g, oz). If not found, use null.

      Output ONLY a valid JSON object. Do not provide any conversational text or explanations.
      
      Example JSON format:
      {
        "brand": "BrandName",
        "name": "Product Name",
        "totalCapacity": 100,
        "unit": "ml"
      }
    `;

    // 3. AIへ送信
    const bedrockResponse = await bedrock.send(new InvokeModelCommand({
      modelId: "anthropic.claude-3-haiku-20240307-v1:0", // Haikuを使用
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 1000,
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: prompt },
              { 
                type: "image", 
                source: { 
                  type: "base64", 
                  media_type: mediaType, // ✨ ここで自動判別したタイプを使う
                  data: base64Image 
                } 
              }
            ]
          }
        ]
      }),
    }));

    // 4. 結果の受け取りと整形
    const responseBody = JSON.parse(new TextDecoder().decode(bedrockResponse.body));
    const resultText = responseBody.content[0].text;
    console.log("Raw AI response:", resultText);

    const jsonMatch = resultText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("No JSON found in AI response");
    }
    
    return JSON.parse(jsonMatch[0]);

  } catch (error) {
    console.error("Error details:", error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    throw new Error(`AI Error Details: ${errorMessage}`); 
  }
};
import { defineBackend } from '@aws-amplify/backend';
import { auth } from './auth/resource';
import { data } from './data/resource';
import { storage } from './storage/resource';
import { analyzeImage } from './functions/analyze-image/resource';
import { PolicyStatement } from "aws-cdk-lib/aws-iam"; // 👈 追加: 権限を作るためのツール

const backend = defineBackend({
  auth,
  data,
  storage,
  analyzeImage,
});

// 1. AI関数に「バケット名」を教えてあげる
// @ts-ignore
backend.analyzeImage.resources.lambda.addEnvironment(
  "BUCKET_NAME",
  backend.storage.resources.bucket.bucketName
);

// 2. AI関数に「S3の画像を読み込む権限」を与える
backend.storage.resources.bucket.grantRead(backend.analyzeImage.resources.lambda);

// 3. ✨ ここが重要！「Bedrock (AI) を使う権限」を与える
backend.analyzeImage.resources.lambda.addToRolePolicy(
  new PolicyStatement({
    actions: ["bedrock:InvokeModel"],
    resources: ["*"], // すべてのモデルへのアクセスを許可
  })
);
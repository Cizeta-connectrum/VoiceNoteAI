const { SpeechClient } = require('@google-cloud/speech');
const { VertexAI } = require('@google-cloud/vertexai');

// 環境変数の読み込み
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_KEY);

// ★【重要修正】Netlify上で改行コードが壊れるのを防ぐ処理
if (credentials.private_key) {
  credentials.private_key = credentials.private_key.replace(/\\n/g, '\n');
}

const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION; // us-central1 または us-west1

const speechClient = new SpeechClient({ credentials });
const vertexAI = new VertexAI({ project: projectId, location: location, googleAuthOptions: { credentials } });

// モデル指定（安定版の Pro モデルを使用）
const model = vertexAI.preview.getGenerativeModel({ model: 'gemini-1.0-pro' });

exports.handler = async (event, context) => {
  // POSTメソッド以外は拒否
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const audioBase64 = body.audioBase64; // フロントエンドから送られたBase64データ

    if (!audioBase64) {
      return { statusCode: 400, body: 'No audio data provided' };
    }

    // 1. 音声認識 (Speech-to-Text)
    const audio = { content: audioBase64 };
    const config = {
      encoding: 'MP3',
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
    };

    const [response] = await speechClient.recognize({ audio, config });
    
    // 音声認識結果がない場合のハンドリング
    if (!response.results || response.results.length === 0) {
        return { statusCode: 200, body: JSON.stringify({ transcript: "(音声が認識できませんでした)", summary: "なし", actionItems: [] }) };
    }

    const transcript = response.results
      .map(result => result.alternatives[0].transcript)
      .join('\n');

    // 2. Vertex AI (Gemini) で解析
    const prompt = `
      以下の通話記録を分析し、JSON形式で出力してください。
      出力キー: "summary" (要約リスト), "actionItems" (タスクリスト: {task, assignee, deadline}), "sentiment" (ポジティブ/ネガティブ)

      通話記録:
      ${transcript}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.candidates[0].content.parts[0].text;
    
    // JSON整形（Markdown記法 ```json ... ``` を除去）
    const jsonString = responseText.replace(/```json|```/g, '').trim();
    const analyzeResult = JSON.parse(jsonString);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, ...analyzeResult }),
    };

  } catch (error) {
    console.error('Error:', error);
    // エラー内容を詳細に返す
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, details: error.toString() }),
    };
  }
};
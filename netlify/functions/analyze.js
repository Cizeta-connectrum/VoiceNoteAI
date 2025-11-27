// ファイル名: netlify/functions/analyze.js

const { SpeechClient } = require('@google-cloud/speech');
const { VertexAI } = require('@google-cloud/vertexai');

// 環境変数から認証情報を読み込む
const credentials = JSON.parse(process.env.GOOGLE_SERVICE_KEY);
const projectId = process.env.GCP_PROJECT_ID;
const location = process.env.GCP_LOCATION;

const speechClient = new SpeechClient({ credentials });
const vertexAI = new VertexAI({ project: projectId, location: location, googleAuthOptions: { credentials } });
const model = vertexAI.preview.getGenerativeModel({ model: 'gemini-1.5-flash-001' });

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
      encoding: 'MP3', // または送信された形式に合わせて変更
      sampleRateHertz: 16000,
      languageCode: 'ja-JP',
    };

    const [response] = await speechClient.recognize({ audio, config });
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
    
    // JSON整形
    const jsonString = responseText.replace(/```json|```/g, '').trim();
    const analyzeResult = JSON.parse(jsonString);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transcript, ...analyzeResult }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message }),
    };
  }
};

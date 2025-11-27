const { GoogleGenerativeAI } = require('@google/generative-ai');

// 環境変数からAPIキーを読み込む
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

exports.handler = async (event, context) => {
  // POSTメソッド以外は拒否
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  try {
    const body = JSON.parse(event.body);
    const audioBase64 = body.audioBase64;

    if (!audioBase64) {
      return { statusCode: 400, body: 'No audio data provided' };
    }

    // モデルの指定 (Gemini 1.5 Flash)
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // プロンプトの作成
    const prompt = `
      あなたは優秀な秘書です。以下の音声データを分析し、結果を必ずJSON形式のみで出力してください。
      Markdownのコードブロック（\`\`\`json）は含めないでください。

      出力フォーマット:
      {
        "transcript": "音声の文字起こしテキスト",
        "summary": ["要点の箇条書き1", "要点の箇条書き2"],
        "actionItems": [
          {"task": "タスク内容", "assignee": "担当者", "deadline": "期限"}
        ],
        "sentiment": "Positive / Neutral / Negative",
        "sentimentScore": 0.8
      }
    `;

    // Geminiに音声データとプロンプトを送信
    const result = await model.generateContent([
      prompt,
      {
        inlineData: {
          mimeType: "audio/mp3",
          data: audioBase64
        }
      }
    ]);

    const response = await result.response;
    const text = response.text();
    
    // JSONの整形（万が一Markdownが含まれていた場合の除去）
    const cleanJson = text.replace(/```json|```/g, '').trim();
    const data = JSON.parse(cleanJson);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message, details: error.toString() }),
    };
  }
};

ステップ 4：変更を反映する（完了！）
最後にターミナルで以下のコマンドを順番に実行して、Netlifyへ反映させます。
# 1. ライブラリを更新する
npm install

# 2. 変更をNetlifyへ送信する
git add .
git commit -m "Switch to simple API Key auth"
git push origin main



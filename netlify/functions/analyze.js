export const handler = async (event, context) => {
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

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) {
      return { statusCode: 500, body: JSON.stringify({ error: "API Key is missing in environment variables" }) };
    }

    // プロンプトの作成
    // Gemini 1.0 Pro はマルチモーダル（音声直接入力）に対応していない場合があるため、
    // テキストベースの処理を前提としたプロンプト構成に安全策をとります。
    // ※今回は「音声ファイル(mp3)」を「Inline Data」として送るため、
    // マルチモーダル対応の gemini-1.5-flash が理想ですが、404が出るため
    // 次善の策として gemini-1.5-pro-latest を試します。
    // それでもダメなら gemini-pro (テキストのみ) になりますが、まずはこれで行きます。
    
    const modelName = "gemini-1.5-pro-latest"; // 最新の安定版エイリアス

    const promptText = `
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

    // APIエンドポイント: v1beta (新しいモデル用)
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            {
              inline_data: {
                mime_type: "audio/mp3",
                data: audioBase64
              }
            }
          ]
        }]
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      // エラー内容をそのまま返すことでデバッグしやすくする
      throw new Error(`Gemini API Error (${modelName}): ${response.status} ${response.statusText} - ${errorText}`);
    }

    const result = await response.json();
    
    const candidates = result.candidates;
    if (!candidates || candidates.length === 0) {
      throw new Error("No candidates returned from Gemini API");
    }

    const responseText = candidates[0].content.parts[0].text;
    const cleanJson = responseText.replace(/```json|```/g, '').trim();
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
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

    // 503エラー（混雑）回避のため、gemini-2.5-flash から gemini-2.0-flash に変更
    // ※もし2.0も混雑している場合は "gemini-flash-latest" を試してください
    const modelName = "gemini-2.0-flash"; 

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

    // APIエンドポイント: v1beta
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
      
      // ★デバッグ用: エラー時のモデル一覧取得ロジック（そのまま残します）
      let debugInfo = "";
      if (response.status === 404) {
        try {
          const listResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`);
          const listData = await listResp.json();
          const availableModels = listData.models ? listData.models.map(m => m.name) : "取得できませんでした";
          debugInfo = `\n【デバッグ情報】あなたのAPIキーで利用可能なモデル一覧:\n${JSON.stringify(availableModels, null, 2)}`;
        } catch (e) {
          debugInfo = "\n(モデル一覧の取得にも失敗しました)";
        }
      }

      throw new Error(`Gemini API Error: ${response.status} ${response.statusText} - ${errorText}${debugInfo}`);
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
    // エラーの詳細を画面（フロントエンド）に返す
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "解析に失敗しました", 
        details: error.message 
      }),
    };
  }
};
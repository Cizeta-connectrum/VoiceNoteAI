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

    // プロンプトをテンプレート式に変更
    const promptText = `
      あなたは優秀な秘書です。以下の音声データを分析し、結果を必ずJSON形式のみで出力してください。
      Markdownのコードブロック（\`\`\`json）は含めないでください。
      
      【重要】
      - 出力は純粋なJSON文字列のみにしてください。
      - JSON内の文字列に改行を含める場合は、必ず "\\n" とエスケープしてください。
      - 制御文字（タブや生の改行など）を文字列値の中に含めないでください。

      特に「summary」フィールドは、通話内容から以下の情報を抽出し、配列形式で整理してください。
      該当する情報がない場合は「不明」または「なし」としてください。

      ■要約テンプレート
      【目的】通話の主な目的（◯◯を知りたい、解決したい等）
      【背景】現在の状況や経緯
      【質問・課題】具体的な質問内容や相談事項
      【希望・要望】相手に求めている対応や回答の形式

      出力フォーマット:
      {
        "transcript": "音声の文字起こしテキスト",
        "summary": [
          "【目的】...",
          "【背景】...",
          "【質問・課題】...",
          "【希望・要望】..."
        ],
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
    
    // JSON整形・クリーニング処理の強化
    // 1. Markdown記法を削除
    let cleanJson = responseText.replace(/```json|```/g, '').trim();
    
    // 2. { ... } の範囲だけを確実に抽出（前後の余計な文字を削除）
    const firstBrace = cleanJson.indexOf('{');
    const lastBrace = cleanJson.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace !== -1) {
      cleanJson = cleanJson.substring(firstBrace, lastBrace + 1);
    }

    // 3. JSONパース実行（失敗時の詳細ログ出力付き）
    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("JSON Parse Error Raw Text:", cleanJson);
      // 制御文字が含まれている場合の救済措置（簡易的なサニタイズ）
      try {
        // 制御文字（0x00-0x1F）を除去して再トライ
        const sanitized = cleanJson.replace(/[\u0000-\u001F]+/g, "");
        data = JSON.parse(sanitized);
      } catch (retryError) {
        throw new Error(`AIの応答が正しいJSON形式ではありませんでした: ${parseError.message}`);
      }
    }

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
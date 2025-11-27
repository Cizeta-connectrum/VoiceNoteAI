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
    const modelName = "gemini-2.0-flash"; 

    // プロンプトをテンプレート式に変更
    const promptText = `
      あなたは優秀な秘書です。以下の音声データを分析し、結果を必ずJSON形式のみで出力してください。

      特に「summary」フィールドは、通話内容から以下の情報を抽出し、配列形式で整理してください。
      該当する情報がない場合は「不明」または「なし」としてください。

      ■製品・サービスリスト（以下の製品名が話題に出ているか特に注意して分析してください）
      [インプラント関連]
      ・インプラントシミュレーションソフト「LANDmarker」
      ・サージカルガイド「LANDmark Guide」
      ・デジタル技工「LANDmark Crown」
      [CT画像関連]
      ・歯科用CT「NewTom GO」 / 「NewTom GiANO」 / 「NewTom VGi evo」 / 「RevoluX」
      ・デンタル用IPスキャナー「PSピックス」
      ・デンタル用X線センサー「X-VS」
      ・口腔内カメラ「SOPRO717 ファースト」 / 「Good Dr's」
      [アプリ・システム]
      ・歯周病・インプラント周囲炎診断支援アプリ「PerioDx」
      ・チェアサイド細菌検査システム「QUON Perio」
      ・くちとれ滑舌アプリ「PaTaKaRUSH」
      [その他]
      ・歯科用３Dプリンタ「Form3B+」
      ・光重合機「FlashMax460」

      ■要約テンプレート
      【目的】通話の主な目的（◯◯を知りたい、解決したい等）
      【対象製品】上記リストの中で、話題に上がっている製品名（該当なしの場合は「なし」）
      【背景】現在の状況や経緯
      【質問・課題】具体的な質問内容や相談事項
      【希望・要望】相手に求めている対応や回答の形式

      出力フォーマット:
      {
        "transcript": "音声の文字起こしテキスト",
        "summary": [
          "【目的】...",
          "【対象製品】...",
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
        }],
        // ★重要: JSONモードを有効化し、トークン制限を緩和する設定を追加
        generationConfig: {
          response_mime_type: "application/json",
          max_output_tokens: 8192
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      
      // ★デバッグ用: エラー時のモデル一覧取得ロジック
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
    
    // JSONモードを使用しているため、レスポンスは既にクリーンなJSON文字列です
    // Markdown記法（```json）の削除処理は不要ですが、念のためトリミングだけ行います
    const cleanJson = responseText.trim();

    // 3. JSONパース実行（失敗時の詳細ログ出力付き）
    let data;
    try {
      data = JSON.parse(cleanJson);
    } catch (parseError) {
      console.error("JSON Parse Error Raw Text:", cleanJson);
      // 制御文字が含まれている場合の救済措置（簡易的なサニタイズ）
      try {
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
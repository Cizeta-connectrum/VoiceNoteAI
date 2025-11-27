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

    // 高速・長文対応モデル
    const modelName = "gemini-2.0-flash"; 

    // -------------------------------------------------------
    // ステップ 1: まず「文字起こし」だけを行う (Transcript Generation)
    // -------------------------------------------------------
    const transcriptPrompt = `
      以下の音声ファイルを聞き取り、会話内容をすべて文字起こししてください。
      
      【重要】
      - 発言者ごとに改行してください。
      - 「アイキャット担当者（金子,高島,川越,澤田,上田のいずれか）」と「顧客（先生など）」を区別し、名前がわかる場合は "名前: 発言" の形式にしてください。
      - 余計な前置きや挨拶は不要です。文字起こしテキストのみを出力してください。
    `;

    // REST APIを直接コール（SDK依存回避）
    const transcriptResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: transcriptPrompt },
            { inline_data: { mime_type: "audio/mp3", data: audioBase64 } }
          ]
        }]
      })
    });

    if (!transcriptResp.ok) {
      const errText = await transcriptResp.text();
      throw new Error(`Transcript API Error: ${transcriptResp.status} - ${errText}`);
    }
    
    const transcriptJson = await transcriptResp.json();
    const transcriptText = transcriptJson.candidates?.[0]?.content?.parts?.[0]?.text || "(文字起こしに失敗しました)";


    // -------------------------------------------------------
    // ステップ 2: 文字起こしテキストを使って「分析」を行う (Analysis)
    // -------------------------------------------------------
    const analysisPrompt = `
      あなたは優秀な秘書です。以下の【通話ログ】を分析し、JSON形式で出力してください。

      ■製品・サービスリスト（話題に出ているか注意してください）
      [インプラント関連] LANDmarker, LANDmark Guide, LANDmark Crown
      [CT画像関連] NewTom GO, NewTom GiANO, NewTom VGi evo, RevoluX, PSピックス, X-VS, SOPRO717 ファースト, Good Dr's
      [アプリ] PerioDx, QUON Perio, PaTaKaRUSH
      [その他] Form3B+, FlashMax460

      ■要約テンプレート
      【対象製品】上記リストの中で話題に出た製品名（なければ「なし」）
      【目的】通話の主な目的
      【背景】現在の状況や経緯
      【質問・課題】具体的な質問内容や相談事項
      【希望・要望】相手に求めている対応

      ■出力フォーマット(JSONのみ):
      {
        "summary": [
          "【対象製品】...", 
          "【目的】...", 
          "【背景】...", 
          "【質問・課題】...", 
          "【希望・要望】..."
        ],
        "actionItems": [
          {"task": "...", "assignee": "...", "deadline": "..."}
        ],
        "sentiment": "Positive" | "Neutral" | "Negative",
        "sentimentScore": 0.8
      }

      【通話ログ】
      ${transcriptText}
    `;

    const analyzeResp = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: analysisPrompt }] }],
        // JSONモードを有効化してパースエラーを防ぐ
        generationConfig: { 
          response_mime_type: "application/json",
          max_output_tokens: 8192
        }
      })
    });

    if (!analyzeResp.ok) {
      const errText = await analyzeResp.text();
      throw new Error(`Analysis API Error: ${analyzeResp.status} - ${errText}`);
    }

    const analyzeJson = await analyzeResp.json();
    const analyzeText = analyzeJson.candidates?.[0]?.content?.parts?.[0]?.text || "{}";

    // 分析結果(JSON)をパース
    let resultData = {};
    try {
      resultData = JSON.parse(analyzeText.trim());
    } catch (e) {
      console.error("JSON Parse Error:", analyzeText);
      // JSONパースに失敗しても、文字起こしだけは返すための救済措置
      resultData = { 
        summary: ["(要約の生成に失敗しました)"], 
        actionItems: [], 
        sentiment: "Neutral",
        sentimentScore: 0.5
      };
    }

    // -------------------------------------------------------
    // 結果の結合: 文字起こし(Step1) + 分析結果(Step2)
    // -------------------------------------------------------
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        transcript: transcriptText, // Step1の結果をここに統合
        ...resultData               // Step2の結果を展開
      }),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: "解析プロセスエラー", 
        details: error.message 
      }),
    };
  }
};
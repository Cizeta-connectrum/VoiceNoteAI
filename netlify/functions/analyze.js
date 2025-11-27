export const handler = async (event, context) => {
  if (event.httpMethod !== 'POST') { return { statusCode: 405, body: 'Method Not Allowed' }; }

  try {
    const body = JSON.parse(event.body);
    const audioBase64 = body.audioBase64;
    if (!audioBase64) { return { statusCode: 400, body: 'No audio data provided' }; }

    const apiKey = process.env.GOOGLE_API_KEY;
    if (!apiKey) { return { statusCode: 500, body: JSON.stringify({ error: "API Key is missing" }) }; }

    const modelName = "gemini-2.0-flash"; 

    // プロンプト: transcript を一番最後に配置して、途中で切れても要約だけは守る
    const promptText = `
      あなたは優秀な秘書です。以下の音声データを分析し、結果を必ずJSON形式のみで出力してください。

      ■製品リスト
      [インプラント関連] LANDmarker, LANDmark Guide, LANDmark Crown
      [CT画像関連] NewTom GO, NewTom GiANO, NewTom VGi evo, RevoluX, PSピックス, X-VS, SOPRO717 ファースト, Good Dr's
      [アプリ] PerioDx, QUON Perio, PaTaKaRUSH
      [その他] Form3B+, FlashMax460

      ■担当者
      金子, 高島, 川越, 澤田, 上田

      ■要約テンプレート
      【対象製品】...
      【目的】...
      【背景】...
      【質問・課題】...
      【希望・要望】...

      出力フォーマット:
      {
        "summary": ["【対象製品】...", "【目的】...", ...],
        "actionItems": [{"task": "...", "assignee": "...", "deadline": "..."}],
        "sentiment": "Positive",
        "sentimentScore": 0.8,
        "transcript": "話者名: 発言内容\\n..." 
      }
      ※重要: transcript（全文文字起こし）は非常に長くなるため、必ずJSONの【最後】のフィールドにしてください。
    `;

    const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [
            { text: promptText },
            { inline_data: { mime_type: "audio/mp3", data: audioBase64 } }
          ]
        }],
        generationConfig: {
          response_mime_type: "application/json",
          max_output_tokens: 8192
        }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
    }

    const result = await response.json();
    const candidates = result.candidates;
    if (!candidates || candidates.length === 0) { throw new Error("No candidates returned"); }

    let responseText = candidates[0].content.parts[0].text.trim();
    
    // ★JSON修復ロジック（途中で切れた場合の対策）
    // 末尾が "}" で終わっていなければ、強制的に閉じる
    if (!responseText.endsWith('}')) {
      // 文字列の途中なら " で閉じてから } をつける
      // 簡易的な修復ですが、transcriptの末尾が少し切れるだけで済みます
      responseText += '"}'; 
    }

    let data;
    try {
      data = JSON.parse(responseText);
    } catch (parseError) {
      console.error("JSON Parse Error, attempting aggressive fix:", responseText);
      // さらに強力な修復: 最後の有効な "transcript": "..." の手前までで切って、無理やりJSONとして成立させる
      try {
        const lastQuoteIndex = responseText.lastIndexOf('"transcript"');
        if (lastQuoteIndex !== -1) {
           // transcript部分を捨ててでも、要約だけは救出する
           const cutText = responseText.substring(0, lastQuoteIndex) + '"transcript": "（文字数が多すぎるため表示できません）"}';
           // カンマ等の修正
           const fixedText = cutText.replace(/,\s*"transcript"/, ',"transcript"'); 
           data = JSON.parse(fixedText);
        } else {
           throw parseError;
        }
      } catch (e) {
        throw new Error(`JSON解析エラー: ${parseError.message}`);
      }
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    };

  } catch (error) {
    console.error('Error:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "解析エラー", details: error.message }),
    };
  }
};



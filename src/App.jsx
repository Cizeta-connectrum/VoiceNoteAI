import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, FileAudio, CheckCircle, Play, Pause, Cpu, List, 
  MessageSquare, CalendarCheck, Smile, AlertCircle, Download, 
  Copy, Trash2, Calendar, FileText, Mail, Settings, X, User,
  FileSpreadsheet, Save
} from 'lucide-react';

// --- 定数定義: プロンプトで共通して使用するリスト ---
const PRODUCT_LIST_TEXT = `
[インプラント関連]
・インプラントシミュレーションソフト「LANDmarker」(ランドマーカー)
・サージカルガイド「LANDmark Guide」(ランドマークガイド)
・デジタル技工「LANDmark Crown」(ランドマーククラウン)
[CT画像関連]
・歯科用CT「NewTom GO」(ニュートム ゴー)
・歯科用CT「NewTom GiANO」(ニュートム ジャノ)
・歯科用CT「NewTom VGi evo」(ニュートム ブイジーアイ エボ)
・歯科用CT「RevoluX」(レボルックス)
・デンタル用IPスキャナー「PSピックス」
・デンタル用X線センサー「X-VS」
・口腔内カメラ「SOPRO717 ファースト」 / 「Good Dr's」
[アプリ・システム]
・歯周病・インプラント周囲炎診断支援アプリ「PerioDx」(ペリオディーエックス)
・チェアサイド細菌検査システム「QUON Perio」(クオン ペリオ)
・くちとれ滑舌アプリ「PaTaKaRUSH」(パタカラッシュ)
[その他]
・歯科用３Dプリンタ「Form3B+」
・光重合機「FlashMax460」
`;

const MEMBER_LIST_TEXT = `
・金子 (カネコ)
・高島 (タカシマ)
・川越 (カワゴエ)
・澤田 (サワダ)
・上田 (ウエダ)
`;
// ---------------------------------------------------

// lamejsをCDNから動的に読み込む
const loadLamejs = () => {
  return new Promise((resolve, reject) => {
    if (window.lamejs) {
      resolve(window.lamejs);
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/lamejs@1.2.1/lame.all.js';
    script.onload = () => resolve(window.lamejs);
    script.onerror = () => reject(new Error('Failed to load lamejs library'));
    document.head.appendChild(script);
  });
};

// Gemini APIを直接呼び出す関数
const callGeminiDirectly = async (apiKey, promptText, audioBase64 = null, responseMimeType = "application/json") => {
  if (!apiKey) {
    throw new Error("APIキーが設定されていません。画面右上の「設定」からGoogle APIキーを入力してください。");
  }

  const modelName = "gemini-2.0-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelName}:generateContent?key=${apiKey}`;

  const contents = [{
    parts: [
      { text: promptText }
    ]
  }];

  if (audioBase64) {
    contents[0].parts.push({
      inline_data: {
        mime_type: "audio/mp3",
        data: audioBase64
      }
    });
  }

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: contents,
      generationConfig: {
        response_mime_type: responseMimeType,
        max_output_tokens: 8192,
        temperature: 0.2
      }
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    if (response.status === 400 && errorText.includes("API_KEY_INVALID")) {
      throw new Error("APIキーが無効です。正しいキーが設定されているか確認してください。");
    }
    throw new Error(`Gemini API Error: ${response.status} - ${errorText}`);
  }

  const result = await response.json();
  const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
  
  if (!text) throw new Error("AIからの応答が空でした。");

  return text;
};

// Base64変換
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result;
      const base64String = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

// 音声を指定範囲で切り出し、軽量MP3に圧縮する関数
const processAudioChunk = async (file, startTime = 0, duration = null) => {
  try {
    await loadLamejs();
    const arrayBuffer = await file.arrayBuffer();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeErr) {
      throw new Error("音声ファイルのデコードに失敗しました。");
    }

    const totalDuration = audioBuffer.duration;
    const actualStartTime = Math.min(startTime, totalDuration);
    const actualDuration = duration 
      ? Math.min(duration, totalDuration - actualStartTime) 
      : totalDuration - actualStartTime;

    if (actualDuration <= 0) return null;

    const targetSampleRate = 16000;
    const OfflineContext = window.OfflineAudioContext || window.webkitOfflineAudioContext;
    const offlineContext = new OfflineContext(1, actualDuration * targetSampleRate, targetSampleRate);
    
    const source = offlineContext.createBufferSource();
    source.buffer = audioBuffer;
    source.connect(offlineContext.destination);
    source.start(0, actualStartTime, actualDuration);
    
    const renderedBuffer = await offlineContext.startRendering();
    const pcmData = renderedBuffer.getChannelData(0);
    
    const samples = new Int16Array(pcmData.length);
    for (let i = 0; i < pcmData.length; i++) {
      let s = Math.max(-1, Math.min(1, pcmData[i]));
      samples[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
    }

    const mp3encoder = new window.lamejs.Mp3Encoder(1, targetSampleRate, 32); 
    const mp3Data = [];
    const sampleBlockSize = 1152;
    
    for (let i = 0; i < samples.length; i += sampleBlockSize) {
      const sampleChunk = samples.subarray(i, i + sampleBlockSize);
      const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
      if (mp3buf.length > 0) mp3Data.push(mp3buf);
    }
    
    const mp3buf = mp3encoder.flush();
    if (mp3buf.length > 0) mp3Data.push(mp3buf);

    const blob = new Blob(mp3Data, { type: 'audio/mp3' });
    return {
      blob: new File([blob], "chunk.mp3", { type: 'audio/mp3' }),
      duration: actualDuration,
      isEnd: (actualStartTime + actualDuration) >= totalDuration,
      totalDuration: totalDuration
    };

  } catch (e) {
    console.error("音声処理エラー:", e);
    throw e;
  }
};

const splitTextIntoChunks = (text, maxLength = 15000) => {
  const chunks = [];
  let currentChunk = "";
  const lines = text.split(/\n/);

  for (const line of lines) {
    if ((currentChunk + line).length > maxLength) {
      chunks.push(currentChunk);
      currentChunk = line + "\n";
    } else {
      currentChunk += line + "\n";
    }
  }
  if (currentChunk.trim()) {
    chunks.push(currentChunk);
  }
  return chunks;
};

// ファイル名から日時を抽出する関数
const extractDateFromFile = (filename, lastModified) => {
  const matchFull = filename.match(/(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})/);
  if (matchFull) {
    const year = parseInt(matchFull[1]);
    const month = parseInt(matchFull[2]) - 1;
    const day = parseInt(matchFull[3]);
    const hour = parseInt(matchFull[4]);
    const minute = parseInt(matchFull[5]);
    return new Date(year, month, day, hour, minute);
  }

  const matchDateOnly = filename.match(/(\d{4})(\d{2})(\d{2})/);
  if (matchDateOnly) {
    const year = parseInt(matchDateOnly[1]);
    const month = parseInt(matchDateOnly[2]) - 1;
    const day = parseInt(matchDateOnly[3]);
    const tempDate = new Date(lastModified);
    return new Date(year, month, day, tempDate.getHours(), tempDate.getMinutes());
  }

  return new Date(lastModified);
};

// 話者名を正規化する関数
const normalizeSpeakerName = (rawName) => {
  if (!rawName) return "顧客";
  const members = ["金子", "高島", "川越", "澤田", "上田"];
  
  for (const member of members) {
    if (rawName.includes(member)) {
      return member;
    }
  }
  return "顧客";
};

// 文字起こしテキストをパースする関数
const parseTranscript = (text) => {
  if (!text) return [];
  return text.split('\n').filter(line => line.trim() !== '').map(line => {
    const colonIndex = line.indexOf(':');
    if (colonIndex !== -1) {
      const rawSpeaker = line.substring(0, colonIndex).trim();
      return {
        speaker: normalizeSpeakerName(rawSpeaker),
        text: line.substring(colonIndex + 1).trim()
      };
    }
    return { speaker: '顧客', text: line };
  });
};

const mergeAnalysisResults = (results) => {
  const merged = {
    summary: [],
    actionItems: [],
    sentiment: "Neutral",
    sentimentScore: 0
  };

  let totalScore = 0;
  let validScoreCount = 0;

  results.forEach(res => {
    if (res.summary && Array.isArray(res.summary)) merged.summary.push(...res.summary);
    if (res.actionItems && Array.isArray(res.actionItems)) merged.actionItems.push(...res.actionItems);
    if (typeof res.sentimentScore === 'number') {
      totalScore += res.sentimentScore;
      validScoreCount++;
    }
  });

  const avgScore = validScoreCount > 0 ? totalScore / validScoreCount : 0.5;
  merged.sentimentScore = avgScore;
  merged.sentiment = avgScore >= 0.6 ? "Positive" : avgScore <= 0.4 ? "Negative" : "Neutral";
  merged.summary = [...new Set(merged.summary)];
  
  return merged;
};

const App = () => {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [activeTab, setActiveTab] = useState('summary');
  const [statusMessage, setStatusMessage] = useState("");
  const [saveStatus, setSaveStatus] = useState(null); // 'saving', 'success', 'error'
  
  // 設定 (API Key & GAS URL)
  const [apiKey, setApiKey] = useState("");
  const [gasUrl, setGasUrl] = useState("");
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const storedKey = localStorage.getItem('google_api_key');
    if (storedKey) setApiKey(storedKey);
    
    const storedGasUrl = localStorage.getItem('gas_app_url');
    if (storedGasUrl) setGasUrl(storedGasUrl);
  }, []);

  const saveSettings = () => {
    localStorage.setItem('google_api_key', apiKey);
    localStorage.setItem('gas_app_url', gasUrl);
    setShowSettings(false);
    alert("設定を保存しました。");
  };

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    processFile(selectedFile);
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) processFile(e.dataTransfer.files[0]);
  };

  const processFile = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      setFileUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setSaveStatus(null);
      setProgress(0);
      setIsPlaying(false);
      setStatusMessage("");
    }
  };

  // ★追加: スプレッドシートへの自動保存関数
  const autoSaveToSpreadsheet = async (data, fileName) => {
    if (!gasUrl) return; // URLが設定されていなければ何もしない

    setSaveStatus('saving');
    try {
      // データの整理
      const summaryData = {};
      const summaryLines = Array.isArray(data.summary) ? data.summary : [data.summary];
      summaryLines.forEach(line => {
        const match = line.match(/^【(.*?)】(.*)$/);
        if (match) {
          summaryData[match[1]] = match[2];
        }
      });

      const tasks = data.actionItems ? data.actionItems.map(t => `・${t.task} (${t.assignee})`).join('\n') : "";

      const payload = {
        date: summaryData["日時"] || new Date().toLocaleString(),
        hospitalName: summaryData["医院名"] || "",
        PIC: summaryData["担当者名"] || "",
        duration: summaryData["対応時間"] || "",
        products: summaryData["対象製品"] || "",
        purpose: summaryData["目的"] || "",
        background: summaryData["経緯"] || "",
        response: summaryData["対応"] || "",
        nextAction: summaryData["今後の対応、訪問予定日"] || "",
        tasks: tasks,
        sentiment: `${data.sentiment} (${Math.round(data.sentimentScore * 100)}%)`,
        fileName: fileName
      };

      // CORS回避のため no-cors モード等は使わず、text/plainで送ってGAS側でパースさせる
      await fetch(gasUrl, {
        method: 'POST',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
      });

      // no-corsだとレスポンスが見れないが、エラーが出なければ成功とみなす
      setSaveStatus('success');
      console.log("Spreadsheet auto-save request sent.");

    } catch (error) {
      console.error("Auto-save failed:", error);
      setSaveStatus('error');
    }
  };

  const startProcessing = async () => {
    if (!file) return;
    if (!apiKey) {
      setShowSettings(true);
      alert("解析を行うには、設定からGoogle APIキーを入力してください。");
      return;
    }

    setIsProcessing(true);
    setSaveStatus(null);
    setProgress(5);
    setStatusMessage("準備中...");

    try {
      const CHUNK_DURATION = 600; 
      let fullTranscript = "";
      let currentStartTime = 0;
      let chunkCount = 1;
      let isFinished = false;
      let audioTotalDuration = 0;

      // Phase 1: 文字起こし
      while (!isFinished) {
        setStatusMessage(`音声処理中... (パート ${chunkCount})`);
        const processed = await processAudioChunk(file, currentStartTime, CHUNK_DURATION);
        
        if (!processed || processed.blob.size === 0) break;

        if (chunkCount === 1) {
            audioTotalDuration = processed.totalDuration;
        }

        setStatusMessage(`パート ${chunkCount} を文字起こし中...`);
        setProgress(10 + (chunkCount * 5)); 

        const audioBase64 = await fileToBase64(processed.blob);

        const transcriptPrompt = `
          あなたはプロの書記官です。以下の音声ファイルを正確に文字起こししてください。
          
          ■重要指示
          1. 話者識別: 以下の「アイキャット担当者」と「顧客」を文脈や名乗りから厳密に識別してください。
             【アイキャット担当者】${MEMBER_LIST_TEXT}
          2. 専門用語: 以下の製品名が会話に出る可能性が高いです。正確に漢字・カタカナ変換してください。
             【製品リスト】${PRODUCT_LIST_TEXT}
          3. 整形: 「あー」「えっと」などのフィラー（言い淀み）は削除し、読みやすい自然な日本語文章にしてください。
          4. 出力形式: 以下の形式で、プレーンテキストとして出力してください。Markdownは不要です。
             名前: 発言内容
        `;

        const transcriptText = await callGeminiDirectly(apiKey, transcriptPrompt, audioBase64, "text/plain");
        
        let cleanedChunk = transcriptText;
        try {
            const jsonStart = transcriptText.indexOf('[');
            const jsonEnd = transcriptText.lastIndexOf(']');
            if (jsonStart !== -1 && jsonEnd !== -1) {
                const potentialJson = transcriptText.substring(jsonStart, jsonEnd + 1);
                const json = JSON.parse(potentialJson);
                if (Array.isArray(json)) {
                    cleanedChunk = json.map(item => {
                        const name = item.Speaker || item.speaker || item.role || "話者";
                        const text = item.utterance || item.text || item.content || "";
                        return `${name}: ${text}`;
                    }).join("\n");
                }
            } else {
               const jsonObjStart = transcriptText.indexOf('{');
               if (jsonObjStart !== -1) {
                 const json = JSON.parse(transcriptText.substring(jsonObjStart));
                 if (json.transcript) cleanedChunk = json.transcript;
               }
            }
        } catch (e) {
            cleanedChunk = transcriptText.replace(/```json|```/g, '').trim();
        }
        
        fullTranscript += cleanedChunk + "\n";

        if (processed.isEnd) {
          isFinished = true;
        } else {
          currentStartTime += CHUNK_DURATION;
          chunkCount++;
        }
      }

      setStatusMessage("要約を生成中...");
      setProgress(90);

      if (!fullTranscript.trim()) throw new Error("文字起こしが生成されませんでした。");

      // 時間計算
      const startTimeDate = extractDateFromFile(file.name, file.lastModified);
      const endTimeDate = new Date(startTimeDate.getTime() + (audioTotalDuration * 1000));
      const formatTime = (date) => `${date.getFullYear()}年${date.getMonth() + 1}月${date.getDate()}日 ${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      const formatTimeOnly = (date) => `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
      const durationMinutes = Math.ceil(audioTotalDuration / 60);
      const dateString = formatTime(startTimeDate);
      const timeRangeString = `${formatTimeOnly(startTimeDate)}~${formatTimeOnly(endTimeDate)} : ${durationMinutes}分`;

      // Phase 2: 要約
      const textChunks = splitTextIntoChunks(fullTranscript, 12000);
      const partialSummaries = [];

      for (let i = 0; i < textChunks.length; i++) {
        const chunk = textChunks[i];
        setStatusMessage(`内容分析中... (${i + 1}/${textChunks.length})`);
        
        const analysisPrompt = `
          以下の通話ログの一部から、重要な事実情報を抽出してください。
          推測は含めず、ログに書かれていることだけを抜き出してください。

          ■抽出項目
          - 医院名、クリニック名
          - 担当者名（アイキャット側、および相手方）
          - 話題に出ている製品名（${PRODUCT_LIST_TEXT} を参照）
          - 通話の目的
          - 経緯
          - 対応内容
          - 今後の予定

          ■出力形式(JSON):
          {
            "summary": ["事実1", "事実2", ...],
            "actionItems": [{"task": "...", "assignee": "...", "deadline": "..."}]
          }

          【通話ログ(一部)】
          ${chunk}
        `;

        try {
          const resultText = await callGeminiDirectly(apiKey, analysisPrompt);
          const cleanJson = resultText.replace(/```json|```/g, '').trim();
          const chunkData = JSON.parse(cleanJson);
          if (chunkData.extracted_points) {
            chunkData.summary = chunkData.extracted_points;
            delete chunkData.extracted_points;
          }
          partialSummaries.push(chunkData);
        } catch (e) {
          console.error(`パート${i+1}の分析エラー:`, e);
        }
      }

      // Phase 3: 最終統合
      setStatusMessage("最終レポートを作成中...");
      
      const synthesisPrompt = `
        あなたは優秀なビジネス秘書です。
        以下の「部分的な分析結果リスト」を統合し、一つの完璧な業務報告レポートを作成してください。

        ■指示
        1. 重複情報の整理: 分割処理により同じ情報が何度も出てくる場合があります。これらを整理・統合し、簡潔にまとめてください。
        2. 製品名の正確性: 以下のリストにある製品名は正式名称で記載してください。
           ${PRODUCT_LIST_TEXT}
        3. 担当者名: アイキャット担当者（${MEMBER_LIST_TEXT}）を正確に記載してください。
        4. 日時情報: 以下の情報を必ずそのまま記載してください。
           - 日時: ${dateString}
           - 音声ファイル名: ${file.name}
           - 対応時間: ${timeRangeString}

        ■入力データ:
        ${JSON.stringify(partialSummaries)}

        ■要約テンプレート
        【医院名】(相手のクリニック名や病院名。不明なら「不明」)
        【担当者名】(アイキャット側の担当者、および相手の名前)
        【日時】${dateString}
        【対応時間】${timeRangeString}
        【音声ファイル名】${file.name}
        【対象製品】(話題に出た製品名を列挙。なければ「なし」)
        【目的】(通話の主な要件)
        【経緯】(問い合わせに至るまでの背景や状況)
        【対応】(この通話で行った説明、操作、回答の内容を具体的に)
        【今後の対応、訪問予定日】(ネクストアクションや約束した日程)

        ■出力フォーマット(JSONのみ):
        {
          "summary": [
            "【医院名】...",
            "【担当者名】...",
            "【日時】...",
            "【対応時間】...",
            "【音声ファイル名】...",
            "【対象製品】...",
            "【目的】...",
            "【経緯】...",
            "【対応】...",
            "【今後の対応、訪問予定日】..."
          ],
          "actionItems": [
            {"task": "具体的なタスク内容", "assignee": "担当者名", "deadline": "期限"}
          ],
          "sentiment": "Positive/Neutral/Negative",
          "sentimentScore": 0.8
        }
      `;

      const finalResultText = await callGeminiDirectly(apiKey, synthesisPrompt);
      const finalCleanJson = finalResultText.replace(/```json|```/g, '').trim();
      const finalData = JSON.parse(finalCleanJson);

      const finalResult = {
        ...finalData,
        transcript: fullTranscript
      };

      setResult(finalResult);
      setActiveTab('summary');

      // ★ここで自動保存を実行
      if (gasUrl) {
        setStatusMessage("スプレッドシートに保存中...");
        await autoSaveToSpreadsheet(finalResult, file.name);
      }

      setProgress(100);
      setStatusMessage("完了");
      
    } catch (error) {
      console.error('Error:', error);
      alert('エラー: ' + error.message);
      setProgress(0);
      setStatusMessage("エラー発生");
    } finally {
      setIsProcessing(false);
    }
  };

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) audioRef.current.pause(); 
      else audioRef.current.play().catch(e => console.error(e));
      setIsPlaying(!isPlaying);
    }
  };
  const onAudioEnded = () => setIsPlaying(false);
  const copyToClipboard = (text) => { navigator.clipboard.writeText(text); alert("コピーしました"); };
  
  const handleDocsIntegration = () => {
    if (!result) return;
    const content = `【要約】\n${Array.isArray(result.summary) ? result.summary.join('\n') : result.summary}\n\n【文字起こし】\n${result.transcript}`;
    navigator.clipboard.writeText(content);
    if(window.confirm("内容をコピーしました。Docsを開きますか？")) window.open("https://docs.google.com/document/create", "_blank");
  };

  const handleCalendarIntegration = (taskText = "AI通話サマライザーからの予定") => {
    const title = encodeURIComponent(taskText);
    const details = encodeURIComponent("VoiceNote AIによる解析結果より追加");
    window.open(`https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`, "_blank");
  };

  const resetApp = () => { setFile(null); setFileUrl(null); setResult(null); setProgress(0); setIsProcessing(false); setIsPlaying(false); setStatusMessage(""); setSaveStatus(null); };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Cpu className="w-5 h-5 text-white" /></div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">VoiceNote AI</h1>
          </div>
          <div className="flex items-center space-x-4">
            {/* 保存ステータス表示 */}
            {saveStatus === 'saving' && <span className="text-xs text-blue-600 animate-pulse">保存中...</span>}
            {saveStatus === 'success' && <span className="text-xs text-green-600 flex items-center"><CheckCircle className="w-3 h-3 mr-1"/>保存完了</span>}
            {saveStatus === 'error' && <span className="text-xs text-red-500">保存失敗</span>}
            
            <button 
              onClick={() => setShowSettings(true)}
              className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors flex items-center gap-1"
            >
              <Settings className="w-4 h-4" /> 設定
            </button>
          </div>
        </div>
      </header>

      {/* 設定モーダル */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 animate-fade-in">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-2xl relative">
            <button 
              onClick={() => setShowSettings(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <X className="w-5 h-5" />
            </button>
            <h2 className="text-xl font-bold text-slate-800 mb-4 flex items-center">
              <Settings className="w-5 h-5 mr-2 text-indigo-600" />
              設定
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Google API Key</label>
                <input 
                  type="password" 
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="AIza..."
                />
                <p className="text-xs text-slate-500 mt-1">Google AI Studioで取得したキー</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-700 mb-1">Google Apps Script (GAS) URL</label>
                <input 
                  type="text" 
                  value={gasUrl}
                  onChange={(e) => setGasUrl(e.target.value)}
                  className="w-full px-4 py-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                  placeholder="https://script.google.com/macros/s/..."
                />
                <p className="text-xs text-slate-500 mt-1">スプレッドシート連携用のウェブアプリURL（設定すると解析後に自動保存されます）</p>
              </div>
              <button 
                onClick={saveSettings}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-2.5 rounded-lg font-bold transition-colors"
              >
                保存する
              </button>
            </div>
          </div>
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-8">
          {/* ファイルアップロード等のUI (変更なし) */}
          {!result && !isProcessing && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center">
              <div className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 transition-colors cursor-pointer" onDragOver={handleDragOver} onDrop={handleDrop}>
                {!file ? (
                  <>
                    <UploadCloud className="w-16 h-16 text-indigo-500 mb-4" />
                    <h3 className="text-lg font-bold text-slate-700 mb-2">音声ファイルをドロップ</h3>
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full cursor-pointer">ファイルを選択<input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} /></label>
                    <p className="mt-4 text-xs text-slate-400">自動圧縮・分割機能付き (長時間ファイル対応)</p>
                  </>
                ) : (
                  <div className="w-full max-w-md">
                    <div className="flex items-center p-4 bg-white rounded-xl shadow-sm mb-6"><FileAudio className="w-6 h-6 text-indigo-600 mr-4" /><p className="font-semibold text-slate-800 truncate flex-1">{file.name}</p><button onClick={resetApp}><Trash2 className="w-5 h-5 text-slate-400" /></button></div>
                    <button onClick={startProcessing} className="w-full bg-indigo-600 text-white py-3 rounded-xl font-bold flex items-center justify-center space-x-2"><Cpu className="w-5 h-5" /><span>AI解析を開始</span></button>
                  </div>
                )}
              </div>
            </div>
          )}
          {isProcessing && (
            <div className="bg-white rounded-2xl p-12 text-center">
              <div className="relative w-24 h-24 mx-auto mb-6"><div className="absolute inset-0 rounded-full border-4 border-slate-100"></div><div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div></div>
              <h3 className="text-xl font-bold text-slate-800 mb-2">処理中...</h3>
              <p className="text-slate-500 mb-4">{statusMessage}</p>
              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden"><div className="h-full bg-indigo-600 transition-all duration-300" style={{ width: `${progress}%` }}></div></div>
            </div>
          )}

          {/* 結果表示エリア */}
          {result && !isProcessing && (
            <div className="animate-fade-in-up space-y-6">
              <div className="bg-white rounded-2xl p-6 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4 w-full md:w-auto">
                   <button onClick={togglePlay} className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white">{isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}</button>
                   <div><h3 className="font-bold text-slate-800 truncate">{file ? file.name : 'audio'}</h3><p className="text-xs text-slate-500">完了</p></div>
                </div>
                <div className="flex space-x-2"><button onClick={resetApp} className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg"><UploadCloud className="w-5 h-5" /></button></div>
                <audio ref={audioRef} src={fileUrl} onEnded={onAudioEnded} className="hidden" />
              </div>
              
              <div className="bg-indigo-50 rounded-xl p-4 flex justify-between items-center">
                <span className="font-semibold text-indigo-800 text-sm">解析結果を活用</span>
                <div className="flex space-x-3">
                  <button onClick={handleDocsIntegration} className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg text-sm font-medium"><FileText className="w-4 h-4 text-blue-600" /><span>Docs</span></button>
                  <button onClick={() => handleCalendarIntegration()} className="flex items-center space-x-2 bg-white px-4 py-2 rounded-lg text-sm font-medium"><Calendar className="w-4 h-4 text-green-600" /><span>Calendar</span></button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                <div className="md:col-span-1 space-y-4">
                  <div className="bg-white rounded-2xl shadow-sm overflow-hidden">
                    <nav className="flex flex-col">
                      <button onClick={() => setActiveTab('summary')} className={`px-6 py-4 text-left font-medium flex items-center space-x-3 ${activeTab === 'summary' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}><List className="w-5 h-5" /><span>AI 要約</span></button>
                      <button onClick={() => setActiveTab('transcript')} className={`px-6 py-4 text-left font-medium flex items-center space-x-3 ${activeTab === 'transcript' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}><MessageSquare className="w-5 h-5" /><span>文字起こし</span></button>
                      <button onClick={() => setActiveTab('action')} className={`px-6 py-4 text-left font-medium flex items-center space-x-3 ${activeTab === 'action' ? 'bg-indigo-50 text-indigo-700' : 'text-slate-600'}`}><CalendarCheck className="w-5 h-5" /><span>タスク</span></button>
                    </nav>
                  </div>
                  {result.sentimentScore !== undefined && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center"><Smile className="w-4 h-4 mr-2" />会話の雰囲気</h4>
                      <div className="flex items-center justify-between mb-2"><span className="text-2xl font-bold text-emerald-600">{result.sentiment || "Positive"}</span><span className="text-sm text-slate-500">{Math.round((result.sentimentScore || 0.8) * 100)}%</span></div>
                      <div className="w-full bg-slate-100 rounded-full h-2"><div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(result.sentimentScore || 0.8) * 100}%` }}></div></div>
                    </div>
                  )}
                </div>
                
                <div className="md:col-span-2">
                  <div className="bg-white rounded-2xl shadow-sm p-8 min-h-[500px]">
                    {activeTab === 'summary' && result.summary && (
                      <div>
                        <div className="flex justify-between mb-6"><h2 className="text-xl font-bold text-slate-800">要約</h2><button onClick={() => copyToClipboard(Array.isArray(result.summary) ? result.summary.join('\n') : result.summary)}><Copy className="w-4 h-4 text-slate-400" /></button></div>
                        <ul className="space-y-4">
                          {Array.isArray(result.summary) ? result.summary.map((point, idx) => (
                            <li key={idx} className="flex items-start">
                              <CheckCircle className="w-5 h-5 text-indigo-500 mr-3 mt-0.5 flex-shrink-0" />
                              <span className="text-slate-700 leading-relaxed whitespace-pre-wrap">{point}</span>
                            </li>
                          )) : <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{result.summary}</p>}
                        </ul>
                      </div>
                    )}
                    {activeTab === 'transcript' && result.transcript && (
                      <div className="flex flex-col h-full">
                        <div className="flex justify-between mb-6">
                          <h2 className="text-xl font-bold text-slate-800">文字起こし</h2>
                          <button onClick={() => copyToClipboard(result.transcript)} className="p-2 hover:bg-slate-100 rounded-lg text-slate-400"><Copy className="w-4 h-4" /></button>
                        </div>
                        <div className="space-y-4 text-slate-700">
                          {parseTranscript(result.transcript).map((item, idx) => (
                            <div key={idx} className="flex space-x-3">
                              <div className="flex flex-col items-center mr-1 min-w-[40px]">
                                <div className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${item.speaker.includes('顧客') ? 'bg-slate-200 text-slate-600' : 'bg-indigo-100 text-indigo-600'}`}>
                                  <User className="w-5 h-5" />
                                </div>
                                <span className="text-[10px] text-slate-500 mt-1 font-medium text-center truncate w-14">{item.speaker}</span>
                              </div>
                              <div className="flex-1 bg-slate-50 rounded-lg p-3 border border-slate-100 self-start">
                                <p className="text-sm leading-relaxed whitespace-pre-wrap">{item.text}</p>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {activeTab === 'action' && result.actionItems && (
                      <div>
                        <h2 className="text-xl font-bold text-slate-800 mb-6">タスク</h2>
                        <div className="space-y-4">
                          {result.actionItems.map((item, idx) => (
                            <div key={idx} className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-start group cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all" onClick={() => handleCalendarIntegration(`${item.task} (${item.assignee})`)}>
                              <div className="h-6 w-6 rounded border-2 border-slate-300 mr-4 mt-0.5 flex-shrink-0 group-hover:border-indigo-500 transition-colors"></div>
                              <div className="flex-1">
                                <p className="font-semibold text-slate-800 mb-1 group-hover:text-indigo-800">{item.task}</p>
                                <div className="flex items-center space-x-4 text-sm text-slate-500">
                                  <span className="flex items-center"><span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>{item.assignee || "担当者未定"}</span>
                                  <span className="text-slate-300">|</span>
                                  <span className="text-orange-600 font-medium">{item.deadline || "期限なし"}</span>
                                </div>
                              </div>
                              <button className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-all shadow-sm"><Calendar className="w-5 h-5" /></button>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </main>
      <style>{`
        @keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
        @keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
        .animate-fade-in { animation: fadeIn 0.5s ease-out forwards; }
        .animate-fade-in-up { animation: fadeInUp 0.5s ease-out forwards; }
      `}</style>
    </div>
  );
};

export default App;
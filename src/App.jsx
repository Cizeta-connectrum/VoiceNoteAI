import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, FileAudio, CheckCircle, Play, Pause, Cpu, List, 
  MessageSquare, CalendarCheck, Smile, AlertCircle, Download, 
  Copy, Trash2, Calendar, FileText, Mail 
} from 'lucide-react';

// lamejsをCDNから動的に読み込む関数
const loadLamejs = () => {
  return new Promise((resolve, reject) => {
    if (window.lamejs) {
      resolve(window.lamejs);
      return;
    }
    const script = document.createElement('script');
    // ★修正: 確実に存在するURLに変更 (unpkg.comのlame.all.jsを使用)
    script.src = 'https://unpkg.com/lamejs@1.2.1/lame.all.js';
    script.onload = () => resolve(window.lamejs);
    script.onerror = () => reject(new Error('Failed to load lamejs library'));
    document.head.appendChild(script);
  });
};

// ファイルをBase64に変換するヘルパー関数
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
    // まずライブラリをロード
    await loadLamejs();

    console.log(`音声処理開始: ${startTime}秒から${duration ? duration + '秒間' : '最後まで'}`);
    const arrayBuffer = await file.arrayBuffer();
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    const audioContext = new AudioContext();
    
    // デコード処理
    let audioBuffer;
    try {
      audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    } catch (decodeErr) {
      throw new Error("音声ファイルのデコードに失敗しました。");
    }

    // 切り出し範囲の計算
    const totalDuration = audioBuffer.duration;
    const actualStartTime = Math.min(startTime, totalDuration);
    const actualDuration = duration 
      ? Math.min(duration, totalDuration - actualStartTime) 
      : totalDuration - actualStartTime;

    if (actualDuration <= 0) return null; // 処理する範囲がない

    // リサンプリング (16kHz) とモノラル化
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

    // window.lamejs からエンコーダーを取得
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
      isEnd: (actualStartTime + actualDuration) >= totalDuration
    };

  } catch (e) {
    console.error("音声処理エラー:", e);
    throw e;
  }
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

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    processFile(selectedFile);
  };

  const handleDragOver = (e) => e.preventDefault();
  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      setFileUrl(URL.createObjectURL(selectedFile));
      setResult(null);
      setProgress(0);
      setIsPlaying(false);
      setStatusMessage("");
    }
  };

  const startProcessing = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(5);
    setStatusMessage("準備中...");

    try {
      // 分割設定 (10分 = 600秒)
      const CHUNK_DURATION = 600; 
      let fullTranscript = "";
      let currentStartTime = 0;
      let chunkCount = 1;
      let isFinished = false;

      // 圧縮・分割・送信ループ
      while (!isFinished) {
        setStatusMessage(`音声処理中... (パート ${chunkCount})`);
        
        // 音声を切り出して圧縮 (CDNロード含む)
        const processed = await processAudioChunk(file, currentStartTime, CHUNK_DURATION);
        
        if (!processed || processed.blob.size === 0) {
          break; // データなし
        }

        // サイズチェック
        if (processed.blob.size > 4.5 * 1024 * 1024) {
          throw new Error(`分割後のサイズ(${ (processed.blob.size/1024/1024).toFixed(1) }MB)がまだ大きすぎます。`);
        }

        setStatusMessage(`パート ${chunkCount} を解析中...`);
        setProgress(10 + (chunkCount * 5)); 

        const audioBase64 = await fileToBase64(processed.blob);

        const response = await fetch('/.netlify/functions/analyze', {
          method: 'POST',
          body: JSON.stringify({ 
            audioBase64,
            mode: "transcript" 
          }),
          headers: { 'Content-Type': 'application/json' }
        });

        if (!response.ok) {
          throw new Error(`パート ${chunkCount} の解析に失敗: ${response.statusText}`);
        }

        const data = await response.json();
        if (data.transcript) {
          fullTranscript += data.transcript + "\n";
        }

        if (processed.isEnd) {
          isFinished = true;
        } else {
          currentStartTime += CHUNK_DURATION;
          chunkCount++;
        }
      }

      setStatusMessage("全データを統合して要約中...");
      setProgress(90);

      if (!fullTranscript.trim()) {
        throw new Error("文字起こしが生成されませんでした。");
      }

      const summaryResponse = await fetch('/.netlify/functions/analyze', {
        method: 'POST',
        body: JSON.stringify({ 
          transcriptText: fullTranscript,
          mode: "summary" 
        }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!summaryResponse.ok) {
        throw new Error(`要約生成に失敗: ${summaryResponse.statusText}`);
      }

      const finalData = await summaryResponse.json();
      
      setResult({
        ...finalData,
        transcript: fullTranscript
      });

      setProgress(100);
      setStatusMessage("完了");
      
    } catch (error) {
      console.error('Error:', error);
      alert('解析中にエラーが発生しました: ' + error.message);
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

  const resetApp = () => { setFile(null); setFileUrl(null); setResult(null); setProgress(0); setIsProcessing(false); setIsPlaying(false); setStatusMessage(""); };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg"><Cpu className="w-5 h-5 text-white" /></div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">VoiceNote AI</h1>
          </div>
          <div className="flex items-center space-x-4"><span className="text-xs text-slate-400 hidden sm:inline">連携済み: Google Workspace</span></div>
        </div>
      </header>
      <main className="max-w-5xl mx-auto px-4 py-8">
        <div className="grid gap-8">
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
                  {/* Sentiment Card */}
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
                      <div><div className="flex justify-between mb-6"><h2 className="text-xl font-bold text-slate-800">要約</h2><button onClick={() => copyToClipboard(Array.isArray(result.summary) ? result.summary.join('\n') : result.summary)}><Copy className="w-4 h-4 text-slate-400" /></button></div><ul className="space-y-4">{Array.isArray(result.summary) ? result.summary.map((point, idx) => (<li key={idx} className="flex items-start"><CheckCircle className="w-5 h-5 text-indigo-500 mr-3 mt-0.5 flex-shrink-0" /><span className="text-slate-700 leading-relaxed whitespace-pre-wrap">{point}</span></li>)) : <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{result.summary}</p>}</ul></div>
                    )}
                    {activeTab === 'transcript' && result.transcript && (
                      <div><div className="flex justify-between mb-6"><h2 className="text-xl font-bold text-slate-800">文字起こし</h2><button onClick={() => copyToClipboard(result.transcript)}><Copy className="w-4 h-4 text-slate-400" /></button></div><p className="text-slate-700 whitespace-pre-wrap text-sm">{result.transcript}</p></div>
                    )}
                    {activeTab === 'action' && result.actionItems && (
                      <div><h2 className="text-xl font-bold text-slate-800 mb-6">タスク</h2><div className="space-y-4">{result.actionItems.map((item, idx) => (<div key={idx} className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-start group cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all" onClick={() => handleCalendarIntegration(`${item.task} (${item.assignee})`)}><div className="h-6 w-6 rounded border-2 border-slate-300 mr-4 mt-0.5 flex-shrink-0 group-hover:border-indigo-500 transition-colors"></div><div className="flex-1"><p className="font-semibold text-slate-800 mb-1 group-hover:text-indigo-800">{item.task}</p><div className="flex items-center space-x-4 text-sm text-slate-500"><span className="flex items-center"><span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>{item.assignee || "担当者未定"}</span><span className="text-slate-300">|</span><span className="text-orange-600 font-medium">{item.deadline || "期限なし"}</span></div></div><button className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-all shadow-sm"><Calendar className="w-5 h-5" /></button></div>))}</div></div>
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
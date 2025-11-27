import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileAudio, 
  CheckCircle, 
  Play, 
  Pause, 
  Cpu, 
  List, 
  MessageSquare, 
  CalendarCheck, 
  Smile, 
  Download, 
  Copy, 
  Trash2, 
  Calendar, 
  FileText
} from 'lucide-react';

// ファイルをBase64に変換するヘルパー関数
const fileToBase64 = (file) => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      // "data:audio/mp3;base64,..." の先頭部分を削除
      const base64String = reader.result.split(',')[1];
      resolve(base64String);
    };
    reader.onerror = (error) => reject(error);
  });
};

const App = () => {
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null); // 再生用URL
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const audioRef = useRef(null);
  const [activeTab, setActiveTab] = useState('summary');

  // ファイル選択時の処理
  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    processFile(selectedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFile(e.dataTransfer.files[0]);
    }
  };

  const processFile = (selectedFile) => {
    if (selectedFile) {
      setFile(selectedFile);
      // 再生・ダウンロード用のURLを生成
      const url = URL.createObjectURL(selectedFile);
      setFileUrl(url);
      setResult(null);
      setProgress(0);
      setIsPlaying(false);
    }
  };

  // AI解析処理
  const startProcessing = async () => {
    if (!file) return;
    setIsProcessing(true);
    setProgress(10);

    try {
      const audioBase64 = await fileToBase64(file);
      setProgress(30);

      const response = await fetch('/.netlify/functions/analyze', {
        method: 'POST',
        body: JSON.stringify({ audioBase64 }),
        headers: { 'Content-Type': 'application/json' }
      });

      if (!response.ok) {
        throw new Error(`サーバーエラー: ${response.statusText}`);
      }

      setProgress(70);

      const data = await response.json();
      if (data.error) {
        throw new Error(data.error);
      }

      setResult(data);
      setProgress(100);
      
    } catch (error) {
      console.error('Error:', error);
      alert('解析中にエラーが発生しました: ' + error.message);
      setProgress(0);
    } finally {
      setIsProcessing(false);
    }
  };

  // プレイヤー制御（修正版）
  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play().catch(e => console.error("再生エラー:", e));
      }
      setIsPlaying(!isPlaying);
    }
  };

  // 音声終了時のハンドラ
  const onAudioEnded = () => {
    setIsPlaying(false);
  };

  // クリップボードコピー
  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard.writeText(text);
    alert("テキストをクリップボードにコピーしました");
  };
  
  // Google Docs連携（コピーして新規作成画面を開く）
  const handleDocsIntegration = () => {
    if (!result) return;
    
    // 全文を結合
    const content = `【要約】\n${Array.isArray(result.summary) ? result.summary.join('\n') : result.summary}\n\n【文字起こし】\n${result.transcript}`;
    
    navigator.clipboard.writeText(content);
    const confirmOpen = window.confirm("解析結果をコピーしました。\nGoogle Docsの新規作成画面を開きますか？\n（開いた後、Ctrl+V で貼り付けてください）");
    
    if (confirmOpen) {
      window.open("https://docs.google.com/document/create", "_blank");
    }
  };

  // Google Calendar連携（URLスキームで予定作成画面を開く）
  const handleCalendarIntegration = (taskText = "AI通話サマライザーからの予定") => {
    const title = encodeURIComponent(taskText);
    const details = encodeURIComponent("VoiceNote AIによる解析結果より追加");
    // 新しいタブでGoogleカレンダーの作成画面を開く
    window.open(`https://www.google.com/calendar/render?action=TEMPLATE&text=${title}&details=${details}`, "_blank");
  };

  // リセット処理
  const resetApp = () => {
    setFile(null);
    setFileUrl(null);
    setResult(null);
    setProgress(0);
    setIsProcessing(false);
    setIsPlaying(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-indigo-100 selection:text-indigo-800">
      {/* ヘッダー */}
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-5xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center space-x-2">
            <div className="bg-indigo-600 p-2 rounded-lg">
              <Cpu className="w-5 h-5 text-white" />
            </div>
            <h1 className="text-xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-indigo-600 to-violet-600">
              VoiceNote AI
            </h1>
          </div>
          <div className="flex items-center space-x-4">
            <span className="text-xs text-slate-400 hidden sm:inline">連携済み: Google Workspace</span>
            <button className="text-sm font-medium text-slate-500 hover:text-indigo-600 transition-colors">
              設定
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-5xl mx-auto px-4 py-8">
        
        <div className="grid gap-8">
          
          {/* 1. ファイルアップロードエリア */}
          {!result && !isProcessing && (
            <div className="bg-white rounded-2xl p-8 shadow-sm border border-slate-200 text-center transition-all duration-300 hover:shadow-md">
              <div 
                className="border-2 border-dashed border-slate-300 rounded-xl p-12 flex flex-col items-center justify-center bg-slate-50 hover:bg-indigo-50 hover:border-indigo-300 transition-colors cursor-pointer group"
                onDragOver={handleDragOver}
                onDrop={handleDrop}
              >
                {!file ? (
                  <>
                    <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm mb-4 group-hover:scale-110 transition-transform">
                      <UploadCloud className="w-8 h-8 text-indigo-500" />
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 mb-2">音声ファイルをドロップ</h3>
                    <p className="text-slate-500 text-sm mb-6">または、ファイルを選択してください</p>
                    <label className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-full font-medium cursor-pointer transition-colors shadow-lg shadow-indigo-200">
                      ファイルを選択
                      <input type="file" className="hidden" accept="audio/*" onChange={handleFileChange} />
                    </label>
                    <p className="mt-4 text-xs text-slate-400">対応形式: mp3, wav, m4a (最大 20MB)</p>
                  </>
                ) : (
                  <div className="w-full max-w-md animate-fade-in">
                    <div className="flex items-center p-4 bg-white rounded-xl shadow-sm border border-slate-200 mb-6">
                      <div className="w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mr-4 flex-shrink-0">
                        <FileAudio className="w-6 h-6 text-indigo-600" />
                      </div>
                      <div className="text-left flex-1 min-w-0">
                        <p className="font-semibold text-slate-800 truncate">{file.name}</p>
                        <p className="text-xs text-slate-500">{(file.size / 1024 / 1024).toFixed(2)} MB</p>
                      </div>
                      <button 
                        onClick={resetApp}
                        className="p-2 hover:bg-red-50 text-slate-400 hover:text-red-500 rounded-full transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                    
                    <button 
                      onClick={startProcessing}
                      className="w-full bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white py-3 rounded-xl font-bold shadow-lg shadow-indigo-200 transition-all active:scale-[0.98] flex items-center justify-center space-x-2"
                    >
                      <Cpu className="w-5 h-5" />
                      <span>AI解析を開始する</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 2. 処理中の表示 */}
          {isProcessing && (
            <div className="bg-white rounded-2xl p-12 shadow-sm border border-slate-200 text-center">
              <div className="max-w-md mx-auto">
                <div className="relative w-24 h-24 mx-auto mb-6">
                  <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                  <div className="absolute inset-0 rounded-full border-4 border-indigo-600 border-t-transparent animate-spin"></div>
                  <div className="absolute inset-0 flex items-center justify-center">
                    <Cpu className="w-8 h-8 text-indigo-600 animate-pulse" />
                  </div>
                </div>
                <h3 className="text-xl font-bold text-slate-800 mb-2">音声データを解析中...</h3>
                <p className="text-slate-500 mb-6">会話の内容を文字起こしし、要点をまとめています。</p>
                
                <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                  <div 
                    className="h-full bg-indigo-600 transition-all duration-300 ease-out rounded-full"
                    style={{ width: `${progress}%` }}
                  ></div>
                </div>
              </div>
            </div>
          )}

          {/* 3. 結果表示エリア */}
          {result && !isProcessing && (
            <div className="animate-fade-in-up space-y-6">
              
              {/* プレイヤー＆基本情報 */}
              <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-4 w-full md:w-auto">
                   <button 
                    onClick={togglePlay}
                    className="w-12 h-12 bg-indigo-600 hover:bg-indigo-700 rounded-full flex items-center justify-center text-white transition-colors shadow-md flex-shrink-0"
                  >
                    {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-1" />}
                  </button>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-bold text-slate-800 truncate">{file ? file.name : 'audio_file.mp3'}</h3>
                    <p className="text-xs text-slate-500">完了</p>
                  </div>
                </div>
                
                {/* 音声波形風ビジュアル */}
                <div className="flex-1 w-full h-8 flex items-center space-x-1 px-4 opacity-50">
                  {[...Array(40)].map((_, i) => (
                    <div 
                      key={i} 
                      className="flex-1 bg-indigo-500 rounded-full transition-all duration-500"
                      style={{ 
                        height: `${Math.max(20, Math.random() * 100)}%`,
                        opacity: isPlaying ? 1 : 0.5
                      }}
                    ></div>
                  ))}
                </div>

                <div className="flex space-x-2">
                  <button 
                    onClick={resetApp}
                    className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors"
                    title="新しくアップロード"
                  >
                    <UploadCloud className="w-5 h-5" />
                  </button>
                  {fileUrl && (
                    <a 
                      href={fileUrl} 
                      download={file ? file.name : "audio.mp3"}
                      className="p-2 text-slate-400 hover:bg-slate-100 rounded-lg transition-colors block"
                      title="ダウンロード"
                    >
                      <Download className="w-5 h-5" />
                    </a>
                  )}
                </div>
                {/* 実際のAudio要素 */}
                <audio 
                  ref={audioRef} 
                  src={fileUrl} 
                  onEnded={onAudioEnded} 
                  className="hidden" 
                />
              </div>

              {/* ★ Google Workspace 連携バー（修正済み） ★ */}
              <div className="bg-indigo-50 rounded-xl p-4 border border-indigo-100 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center space-x-2 text-indigo-800">
                  <div className="bg-white p-1.5 rounded-md shadow-sm">
                    <img 
                      src="https://www.gstatic.com/images/branding/product/1x/google_workspace_48dp.png" 
                      alt="Workspace" 
                      className="w-6 h-6 object-contain" 
                    />
                  </div>
                  <span className="font-semibold text-sm">解析結果を活用する</span>
                </div>
                <div className="flex space-x-3 w-full sm:w-auto">
                  <button 
                    onClick={handleDocsIntegration}
                    className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-white hover:bg-indigo-100 text-slate-700 px-4 py-2 rounded-lg border border-slate-200 transition-colors text-sm font-medium"
                  >
                    <FileText className="w-4 h-4 text-blue-600" />
                    <span>Docsに保存</span>
                  </button>
                  <button 
                    onClick={() => handleCalendarIntegration()}
                    className="flex-1 sm:flex-none flex items-center justify-center space-x-2 bg-white hover:bg-indigo-100 text-slate-700 px-4 py-2 rounded-lg border border-slate-200 transition-colors text-sm font-medium"
                  >
                    <Calendar className="w-4 h-4 text-green-600" />
                    <span>カレンダー登録</span>
                  </button>
                </div>
              </div>

              <div className="grid md:grid-cols-3 gap-6">
                
                {/* 左カラム：ナビゲーション & インサイト */}
                <div className="md:col-span-1 space-y-4">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 overflow-hidden">
                    <nav className="flex flex-col">
                      <button 
                        onClick={() => setActiveTab('summary')}
                        className={`px-6 py-4 text-left font-medium flex items-center space-x-3 transition-colors ${activeTab === 'summary' ? 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <List className="w-5 h-5" />
                        <span>AI 要約</span>
                      </button>
                      <button 
                        onClick={() => setActiveTab('transcript')}
                        className={`px-6 py-4 text-left font-medium flex items-center space-x-3 transition-colors ${activeTab === 'transcript' ? 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <MessageSquare className="w-5 h-5" />
                        <span>全文文字起こし</span>
                      </button>
                      <button 
                        onClick={() => setActiveTab('action')}
                        className={`px-6 py-4 text-left font-medium flex items-center space-x-3 transition-colors ${activeTab === 'action' ? 'bg-indigo-50 text-indigo-700 border-r-4 border-indigo-600' : 'text-slate-600 hover:bg-slate-50'}`}
                      >
                        <CalendarCheck className="w-5 h-5" />
                        <span>ネクストアクション</span>
                        <span className="ml-auto bg-indigo-100 text-indigo-700 text-xs px-2 py-0.5 rounded-full">{result.actionItems ? result.actionItems.length : 0}</span>
                      </button>
                    </nav>
                  </div>

                  {/* 感情分析カード */}
                  {result.sentimentScore !== undefined && (
                    <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200">
                      <h4 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-4 flex items-center">
                        <Smile className="w-4 h-4 mr-2" />
                        会話の雰囲気
                      </h4>
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-2xl font-bold text-emerald-600">{result.sentiment || "Positive"}</span>
                        <span className="text-sm text-slate-500">{Math.round((result.sentimentScore || 0.8) * 100)}%</span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2">
                        <div className="bg-emerald-500 h-2 rounded-full" style={{ width: `${(result.sentimentScore || 0.8) * 100}%` }}></div>
                      </div>
                    </div>
                  )}
                </div>

                {/* 右カラム：コンテンツ */}
                <div className="md:col-span-2">
                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 min-h-[500px] flex flex-col">
                    
                    {/* タブ：要約 */}
                    {activeTab === 'summary' && result.summary && (
                      <div className="p-8 animate-fade-in">
                        <div className="flex items-center justify-between mb-6">
                          <h2 className="text-xl font-bold text-slate-800 flex items-center">
                            <Cpu className="w-5 h-5 text-indigo-600 mr-2" />
                            重要ポイントの要約
                          </h2>
                          <button 
                            onClick={() => copyToClipboard(Array.isArray(result.summary) ? result.summary.join('\n') : result.summary)}
                            className="p-2 hover:bg-slate-100 rounded-lg text-slate-400 transition-colors"
                            title="コピー"
                          >
                            <Copy className="w-4 h-4" />
                          </button>
                        </div>
                        <ul className="space-y-4">
                          {Array.isArray(result.summary) ? result.summary.map((point, idx) => (
                            <li key={idx} className="flex items-start">
                              <CheckCircle className="w-5 h-5 text-indigo-500 mr-3 mt-0.5 flex-shrink-0" />
                              <span className="text-slate-700 leading-relaxed whitespace-pre-wrap">{point}</span>
                            </li>
                          )) : (
                            <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">{result.summary}</p>
                          )}
                        </ul>
                      </div>
                    )}

                    {/* タブ：文字起こし */}
                    {activeTab === 'transcript' && result.transcript && (
                      <div className="flex flex-col h-full animate-fade-in">
                        <div className="p-6 border-b border-slate-100 flex items-center justify-between bg-white rounded-t-2xl sticky top-0 z-10">
                          <h2 className="text-xl font-bold text-slate-800">全文文字起こし</h2>
                          <div className="flex space-x-2">
                            <button 
                              onClick={handleDocsIntegration}
                              className="text-xs font-medium bg-blue-50 hover:bg-blue-100 text-blue-700 px-3 py-1.5 rounded-lg transition-colors flex items-center"
                            >
                              <FileText className="w-3 h-3 mr-1" />
                              Docsへ送る
                            </button>
                            <button 
                              onClick={() => copyToClipboard(result.transcript)}
                              className="text-xs font-medium bg-slate-100 hover:bg-slate-200 px-3 py-1.5 rounded-lg text-slate-600 transition-colors"
                            >
                              すべてコピー
                            </button>
                          </div>
                        </div>
                        <div className="p-6 space-y-6 overflow-y-auto max-h-[600px]">
                          <p className="text-slate-700 leading-relaxed whitespace-pre-wrap">
                            {result.transcript}
                          </p>
                        </div>
                      </div>
                    )}

                    {/* タブ：アクションアイテム */}
                    {activeTab === 'action' && result.actionItems && (
                      <div className="p-8 animate-fade-in">
                        <h2 className="text-xl font-bold text-slate-800 mb-6 flex items-center">
                          <CalendarCheck className="w-5 h-5 text-indigo-600 mr-2" />
                          検出されたタスク
                        </h2>
                        <p className="text-xs text-slate-400 mb-4">クリックするとGoogleカレンダーに登録できます</p>
                        <div className="space-y-4">
                          {result.actionItems.map((item, idx) => (
                            <div 
                              key={idx} 
                              className="bg-slate-50 rounded-xl p-5 border border-slate-200 flex items-start group cursor-pointer hover:bg-indigo-50 hover:border-indigo-200 transition-all"
                              onClick={() => handleCalendarIntegration(`${item.task} (${item.assignee})`)}
                              title="このタスクをカレンダーに追加"
                            >
                              <div className="h-6 w-6 rounded border-2 border-slate-300 mr-4 mt-0.5 flex-shrink-0 group-hover:border-indigo-500 transition-colors"></div>
                              <div className="flex-1">
                                <p className="font-semibold text-slate-800 mb-1 group-hover:text-indigo-800">{item.task}</p>
                                <div className="flex items-center space-x-4 text-sm text-slate-500">
                                  <span className="flex items-center">
                                    <span className="w-2 h-2 bg-indigo-500 rounded-full mr-2"></span>
                                    {item.assignee || "担当者未定"}
                                  </span>
                                  <span className="text-slate-300">|</span>
                                  <span className="text-orange-600 font-medium">{item.deadline || "期限なし"}</span>
                                </div>
                              </div>
                              <button 
                                className="opacity-0 group-hover:opacity-100 p-2 text-slate-400 hover:bg-white hover:text-indigo-600 rounded-lg transition-all shadow-sm"
                              >
                                <Calendar className="w-5 h-5" />
                              </button>
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
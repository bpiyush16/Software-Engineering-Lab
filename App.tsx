
import React, { useState, useRef, useEffect } from 'react';
import { DocumentRecord, RoutingStatus, MySQL_LogRecord, UserProfile, SystemSettings, EmailMessage, OutboundEmail } from './types';
import { classifyDocument } from './services/geminiService';
import { DBService } from './services/dbService';
import Sidebar from './components/Sidebar';
import StatsCards from './components/StatsCards';
import DocumentList from './components/DocumentList';
import DocDetails from './components/DocDetails';
import SettingsPanel from './components/SettingsPanel';
import CommunicationsHub from './components/CommunicationsHub';
import ActivityLogs from './components/ActivityLogs';
import FileExplorer from './components/FileExplorer';
import Login from './components/Login';

const App: React.FC = () => {
  const [activeUser, setActiveUser] = useState<UserProfile | null>(null);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isDarkMode, setIsDarkMode] = useState(() => localStorage.getItem('theme') === 'dark');
  const [isProcessing, setIsProcessing] = useState(false);
  const [selectedDoc, setSelectedDoc] = useState<DocumentRecord | null>(null);
  const [dbConnected, setDbConnected] = useState<boolean | null>(null);

  const [documents, setDocuments] = useState<DocumentRecord[]>([]);
  const [sqlLogs, setSqlLogs] = useState<MySQL_LogRecord[]>([]);
  const [inboundEmails, setInboundEmails] = useState<EmailMessage[]>([]);
  const [outboundEmails, setOutboundEmails] = useState<OutboundEmail[]>([]);
  const [settings, setSettings] = useState<SystemSettings>({
    confidenceThreshold: 0.8,
    autoRoutingEnabled: true,
    defaultDestination: 'Unknown/Review Queue'
  });

  // --- HEARTBEAT CHECK ---
  useEffect(() => {
    const checkConnection = async () => {
      const connected = await DBService.checkHeartbeat();
      setDbConnected(connected);
    };
    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  // --- INITIALIZATION FROM MYSQL ---
  useEffect(() => {
    if (!activeUser || !dbConnected) return;

    const loadData = async () => {
      try {
        const [docs, logs] = await Promise.all([
          DBService.fetchDocuments(activeUser.id),
          DBService.fetchLogs()
        ]);
        setDocuments(docs);
        setSqlLogs(logs);
      } catch (err) {
        console.error("MySQL Sync Error", err);
      }
    };

    loadData();
  }, [activeUser, dbConnected]);

  useEffect(() => {
    if (isDarkMode) document.documentElement.classList.add('dark');
    else document.documentElement.classList.remove('dark');
  }, [isDarkMode]);

  // --- HANDLERS ---
  const handleLogin = async (email: string, password: string) => {
    if (dbConnected === false) {
      alert("Database is currently offline. Please start the backend server (node server.js).");
      return;
    }
    try {
      const profile = await DBService.authenticate(email, password);
      setActiveUser(profile);
      await insertSqlLog('AUTH_SUCCESS', 'SUCCESS', { email });
    } catch (err: any) {
      throw err; // Passed back to Login component for display
    }
  };

  const insertSqlLog = async (event: string, level: MySQL_LogRecord['log_level'], payload: any) => {
    const newLog: Omit<MySQL_LogRecord, 'timestamp'> = {
      log_id: `LOG-${Math.random().toString(36).substr(2, 9).toUpperCase()}`,
      user_id: activeUser?.id || 'SYSTEM',
      event_name: event,
      log_level: level,
      payload_json: JSON.stringify(payload)
    };
    
    try {
      await DBService.saveLog(newLog);
      const updatedLogs = await DBService.fetchLogs();
      setSqlLogs(updatedLogs);
    } catch (err) {
      console.error("Log insertion failed in MySQL");
    }
  };

  const handleUpdateDoc = async (id: string, updates: Partial<DocumentRecord>) => {
    try {
      // Sync with MySQL
      await DBService.updateDocument(id, updates);
      // Update local state
      setDocuments(prev => prev.map(d => d.id === id ? { ...d, ...updates } : d));
      await insertSqlLog('DOCUMENT_UPDATE', 'SUCCESS', { id, updates: Object.keys(updates) });
    } catch (err: any) {
      alert("Failed to update document: " + err.message);
    }
  };

  const processFile = async (base64: string, mimeType: string, fileName: string, origin: 'Upload' | 'Email' = 'Upload', thumb?: string) => {
    if (!dbConnected) {
      alert("Cannot process: Database is offline.");
      return;
    }
    setIsProcessing(true);
    await insertSqlLog('FILE_INGEST_START', 'INFO', { fileName });
    
    try {
      const result = await classifyDocument(base64, mimeType);
      const status = result.confidence < settings.confidenceThreshold ? RoutingStatus.QUARANTINED : RoutingStatus.ROUTED;

      const docRecord: DocumentRecord = {
        id: `DOC-${Math.random().toString(36).substr(2, 5).toUpperCase()}`,
        name: fileName,
        timestamp: Date.now(),
        category: result.category,
        confidence: result.confidence,
        status: status,
        extractedFields: result.extractedFields,
        destination: result.routingDestination,
        summary: result.summary,
        thumbnail: thumb,
        origin
      };

      // Save to MySQL
      await DBService.saveDocument({ 
        ...docRecord, 
        user_id: activeUser?.id 
      } as any);

      // Add to local state
      setDocuments(prev => [docRecord, ...prev]);
      
      await insertSqlLog('CLASSIFICATION_FINISH', status === RoutingStatus.ROUTED ? 'SUCCESS' : 'WARNING', { id: docRecord.id });
    } catch (error: any) {
      console.error("Processing error:", error);
      alert("System encountered an error during classification: " + error.message);
      await insertSqlLog('API_CRITICAL_FAILURE', 'ERROR', { error: error.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!activeUser) return <Login onLogin={handleLogin} />;

  return (
    <div className={`flex min-h-screen ${isDarkMode ? 'bg-darkBg' : 'bg-[#f9fafb]'}`}>
      <Sidebar 
        activeTab={activeTab} 
        onTabChange={setActiveTab} 
        quarantineCount={documents.filter(d => d.status === RoutingStatus.QUARANTINED).length}
        unreadEmailCount={inboundEmails.filter(e => !e.isProcessed).length}
        isDarkMode={isDarkMode}
        onToggleTheme={() => setIsDarkMode(!isDarkMode)}
        onLogout={() => setActiveUser(null)}
        userEmail={activeUser.email}
      />
      <main className="flex-1 lg:ml-64 p-6 lg:p-12 max-w-[1600px]">
        {dbConnected === false && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-xl flex items-center justify-between">
            <div className="flex items-center gap-3">
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              <p className="text-sm font-bold">DATABASE OFFLINE: Local backend (server.js) is not reachable or MySQL is down.</p>
            </div>
            <button onClick={() => window.location.reload()} className="text-xs font-black uppercase underline">Retry Connection</button>
          </div>
        )}

        <header className="flex flex-col md:flex-row md:items-center justify-between mb-12 gap-8">
          <div>
            <div className="flex items-center gap-2 text-indigo-600 dark:text-indigo-400 text-[10px] font-black uppercase tracking-[0.3em] mb-2">
              <span className="w-6 h-[2px] bg-indigo-600 dark:bg-indigo-400"></span>
              MySQL Session: {activeUser.email}
              {dbConnected && <span className="ml-2 px-1.5 py-0.5 bg-emerald-500 text-white rounded text-[8px]">DB ONLINE</span>}
            </div>
            <h1 className="text-4xl font-black text-slate-900 dark:text-white tracking-tight">
              {activeTab === 'quarantine' ? 'Review Quarantine' : activeTab.charAt(0).toUpperCase() + activeTab.slice(1)}
            </h1>
          </div>
          <button 
            onClick={() => fileInputRef.current?.click()}
            disabled={!dbConnected || isProcessing}
            className={`flex items-center gap-2 px-8 py-4 bg-indigo-600 text-white rounded-2xl font-black text-sm shadow-xl active:scale-95 transition-all ${(!dbConnected || isProcessing) ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
          >
            {isProcessing ? 'CLASSIFYING...' : 'INGEST DOC'}
          </button>
          <input type="file" ref={fileInputRef} onChange={(e) => {
            const files = e.target.files;
            if (!files) return;
            Array.from(files).forEach((f: any) => {
              const r = new FileReader();
              r.onload = (ev) => processFile(ev.target?.result?.toString().split(',')[1] || '', f.type, f.name, 'Upload', ev.target?.result?.toString());
              r.readAsDataURL(f);
            });
          }} className="hidden" />
        </header>

        {activeTab === 'dashboard' && (
          <div className="animate-in fade-in duration-500">
            <StatsCards documents={documents} />
            <DocumentList documents={documents} onSelect={setSelectedDoc} />
          </div>
        )}
        {activeTab === 'quarantine' && (
          <div className="animate-in fade-in duration-500">
             <DocumentList documents={documents.filter(d => d.status === RoutingStatus.QUARANTINED)} onSelect={setSelectedDoc} title="Quarantined for Review" />
          </div>
        )}
        {activeTab === 'logs' && <ActivityLogs logs={sqlLogs} onClear={() => setSqlLogs([])} />}
        {activeTab === 'comms' && <CommunicationsHub inbound={inboundEmails} outbound={outboundEmails} onIngest={()=>{}} onRefresh={()=>{}} isRefreshing={false} onSendManualEmail={()=>{}} />}
        {activeTab === 'explorer' && <FileExplorer documents={documents.filter(d => d.status === RoutingStatus.ROUTED)} />}
        {activeTab === 'settings' && <SettingsPanel settings={settings} onUpdate={(u) => setSettings(s => ({...s, ...u}))} />}
        
        {selectedDoc && (
          <DocDetails 
            doc={selectedDoc} 
            onClose={() => setSelectedDoc(null)} 
            onUpdate={handleUpdateDoc} 
          />
        )}
      </main>
    </div>
  );
};

export default App;

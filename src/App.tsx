import React, { useState, useEffect, useRef } from 'react';
import { 
  Folder, 
  File, 
  FileVideo,
  ChevronRight, 
  Home, 
  Upload, 
  FolderPlus, 
  MoreVertical, 
  Trash2, 
  Edit3, 
  Copy, 
  Download, 
  ExternalLink,
  ChevronLeft,
  Search,
  X,
  AlertCircle,
  CheckCircle2,
  Loader2
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface GitHubItem {
  name: string;
  path: string;
  sha: string;
  size: number;
  url: string;
  html_url: string;
  download_url: string | null;
  type: 'file' | 'dir';
}

interface AppConfig {
  hasToken: boolean;
  repo: string;
  branch: string;
  path: string;
}

export default function App() {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [items, setItems] = useState<GitHubItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Modals
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [showNewFolderModal, setShowNewFolderModal] = useState(false);
  const [showRenameModal, setShowRenameModal] = useState<GitHubItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<GitHubItem | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  
  // Form States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchContents(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (selectedItem && isTextFile(selectedItem.name) && selectedItem.download_url) {
      fetchTextContent(selectedItem.download_url);
    } else {
      setTextContent(null);
    }
  }, [selectedItem]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/config');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error("Error fetching config", err);
    }
  };

  const fetchContents = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/contents?path=${encodeURIComponent(path)}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao carregar conteúdo');
      }
      const data = await res.json();
      // Sort: directories first, then files
      const sorted = data.sort((a: GitHubItem, b: GitHubItem) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === 'dir' ? -1 : 1;
      });
      setItems(sorted);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const fetchTextContent = async (url: string) => {
    setLoadingText(true);
    try {
      const res = await fetch(url);
      const text = await res.text();
      setTextContent(text);
    } catch (err) {
      console.error("Error fetching text content", err);
      setTextContent("Erro ao carregar o conteúdo do arquivo.");
    } finally {
      setLoadingText(false);
    }
  };

  const isImage = (name: string) => /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(name);
  const isVideo = (name: string) => /\.(mp4|webm|mov|ogg)$/i.test(name);
  const isTextFile = (name: string) => /\.(txt|md|json|js|ts|tsx|css|html|py|c|cpp|h|java|go|rs|php|sh|yml|yaml)$/i.test(name);

  const handleCreateFolder = async () => {
    if (!newFolderName) return;
    setIsSubmitting(true);
    try {
      const path = currentPath ? `${currentPath}/${newFolderName}` : newFolderName;
      const res = await fetch('/api/folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) throw new Error('Falha ao criar pasta');
      setSuccess('Pasta criada com sucesso!');
      setShowNewFolderModal(false);
      setNewFolderName('');
      fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) return;
    
    // Sanitize filename: allow alphanumeric, dots, dashes and underscores
    const sanitizedName = uploadName.replace(/[^a-zA-Z0-9._-]/g, '_');
    
    setIsSubmitting(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(uploadFile);
      reader.onload = async () => {
        const base64Content = (reader.result as string).split(',')[1];
        const path = currentPath ? `${currentPath}/${sanitizedName}` : sanitizedName;
        
        const res = await fetch('/api/upload', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            path,
            content: base64Content,
            message: `Upload de asset: ${sanitizedName}`
          })
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || 'Falha no upload');
        }

        setSuccess('Asset enviado com sucesso!');
        setShowUploadModal(false);
        setUploadFile(null);
        setUploadName('');
        fetchContents(currentPath);
      };
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRename = async () => {
    if (!showRenameModal || !renameValue) return;
    setIsSubmitting(true);
    try {
      const oldPath = showRenameModal.path;
      const parentPath = currentPath;
      const newPath = parentPath ? `${parentPath}/${renameValue}` : renameValue;

      const res = await fetch('/api/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath, sha: showRenameModal.sha })
      });

      if (!res.ok) throw new Error('Falha ao renomear');
      setSuccess('Item renomeado com sucesso!');
      setShowRenameModal(null);
      setRenameValue('');
      fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (item: GitHubItem) => {
    if (!confirm(`Tem certeza que deseja excluir "${item.name}"?`)) return;
    try {
      const res = await fetch('/api/delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: item.path, sha: item.sha })
      });
      if (!res.ok) throw new Error('Falha ao excluir');
      setSuccess('Item excluído com sucesso!');
      fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    }
  };

  const copyToNotion = (item: GitHubItem) => {
    if (!config) return;
    const rawUrl = `https://raw.githubusercontent.com/${config.repo}/${config.branch}/${item.path}`;
    navigator.clipboard.writeText(rawUrl);
    setSuccess('Link copiado para o Notion!');
    setTimeout(() => setSuccess(null), 2000);
  };

  const breadcrumbs = currentPath.split('/').filter(Boolean);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-zinc-100 font-sans selection:bg-indigo-500/30">
      {/* Loading Overlay for Uploads */}
      <AnimatePresence>
        {isSubmitting && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-md flex flex-col items-center justify-center"
          >
            <div className="bg-zinc-900 border border-zinc-800 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-6 max-w-xs w-full">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
              <div className="text-center">
                <h3 className="font-bold text-lg mb-1">Processando...</h3>
                <p className="text-xs text-zinc-500">Aguarde enquanto sincronizamos com o GitHub.</p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header */}
      <header className="bg-zinc-900/50 backdrop-blur-xl border-b border-zinc-800 sticky top-0 z-30">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-500/20">
              <Home size={22} className="text-white" />
            </div>
            <div>
              <h1 className="font-bold text-lg tracking-tight">RPG Assets</h1>
              <p className="text-[10px] text-zinc-500 uppercase tracking-widest font-semibold">GitHub Cloud Storage</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={() => setShowNewFolderModal(true)}
              className="p-2.5 bg-zinc-800 hover:bg-zinc-700 rounded-xl transition-all active:scale-95 text-zinc-300"
              title="Nova Pasta"
            >
              <FolderPlus size={20} />
            </button>
            <button 
              onClick={() => setShowUploadModal(true)}
              className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 rounded-xl transition-all active:scale-95 font-semibold text-sm shadow-lg shadow-indigo-500/20"
            >
              <Upload size={18} />
              <span>Upload</span>
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 mb-8 bg-zinc-900/30 p-3 rounded-2xl border border-zinc-800/50">
          <button 
            onClick={() => setCurrentPath('')}
            className={`p-1.5 rounded-lg transition-colors ${currentPath === '' ? 'text-indigo-400 bg-indigo-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
          >
            <Home size={18} />
          </button>
          {breadcrumbs.map((crumb, i) => (
            <React.Fragment key={i}>
              <ChevronRight size={14} className="text-zinc-700" />
              <button 
                onClick={() => setCurrentPath(breadcrumbs.slice(0, i + 1).join('/'))}
                className={`px-2 py-1 rounded-lg text-sm font-medium transition-colors ${i === breadcrumbs.length - 1 ? 'text-indigo-400 bg-indigo-400/10' : 'text-zinc-500 hover:text-zinc-300'}`}
              >
                {crumb}
              </button>
            </React.Fragment>
          ))}
        </nav>

        {/* Status Messages */}
        <AnimatePresence>
          {error && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-6 bg-red-500/10 border border-red-500/20 p-4 rounded-2xl flex items-center gap-3 text-red-400"
            >
              <AlertCircle size={18} />
              <span className="text-sm font-medium">{error}</span>
              <button onClick={() => setError(null)} className="ml-auto p-1 hover:bg-red-500/20 rounded-full transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}
          {success && (
            <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
              className="mb-6 bg-emerald-500/10 border border-emerald-500/20 p-4 rounded-2xl flex items-center gap-3 text-emerald-400"
            >
              <CheckCircle2 size={18} />
              <span className="text-sm font-medium">{success}</span>
              <button onClick={() => setSuccess(null)} className="ml-auto p-1 hover:bg-emerald-500/20 rounded-full transition-colors">
                <X size={14} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>

        {/* File Explorer - Grid/Gallery View */}
        <div className="space-y-6">
          {loading ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4">
              <Loader2 className="animate-spin text-indigo-500" size={48} />
              <p className="text-sm text-zinc-500 font-medium animate-pulse">Sincronizando com GitHub...</p>
            </div>
          ) : items.length === 0 ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
              <Folder size={64} className="text-zinc-800" />
              <div className="text-center">
                <p className="text-lg font-bold text-zinc-600">Pasta Vazia</p>
                <p className="text-sm text-zinc-700">Comece criando uma pasta ou fazendo upload de assets.</p>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {items.map((item) => (
                <motion.div
                  layout
                  key={item.sha}
                  className="group relative bg-zinc-900/40 rounded-2xl border border-zinc-800/50 overflow-hidden hover:border-indigo-500/30 transition-all duration-300 hover:shadow-2xl hover:shadow-indigo-500/5 flex flex-col"
                >
                  {/* Preview / Icon Area */}
                  <div 
                    onClick={() => item.type === 'dir' ? setCurrentPath(item.path) : setSelectedItem(item)}
                    className={`aspect-square flex items-center justify-center overflow-hidden bg-zinc-950/50 relative ${item.type === 'dir' ? 'cursor-pointer' : 'cursor-pointer'}`}
                  >
                    {item.type === 'dir' ? (
                      <div className="relative">
                        <Folder size={48} className="text-indigo-500/80 group-hover:scale-110 transition-transform duration-300" />
                      </div>
                    ) : isImage(item.name) ? (
                      <img 
                        src={item.download_url || ''} 
                        alt={item.name}
                        className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-500"
                        referrerPolicy="no-referrer"
                        loading="lazy"
                      />
                    ) : isVideo(item.name) ? (
                      <div className="relative w-full h-full flex items-center justify-center">
                        <FileVideo size={40} className="text-zinc-700" />
                        <div className="absolute inset-0 bg-black/20 group-hover:bg-black/0 transition-colors" />
                      </div>
                    ) : isTextFile(item.name) ? (
                      <div className="p-4 w-full h-full flex flex-col items-center justify-center gap-2">
                        <File size={40} className="text-amber-500/50" />
                        <span className="text-[10px] font-bold text-zinc-600 uppercase tracking-widest">Texto</span>
                      </div>
                    ) : (
                      <File size={40} className="text-zinc-800" />
                    )}

                    {/* Hover Overlay for Files */}
                    {item.type === 'file' && (
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="bg-indigo-600 p-2 rounded-full shadow-lg transform scale-90 group-hover:scale-100 transition-transform">
                          <ExternalLink size={16} className="text-white" />
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Info Area */}
                  <div className="p-3 border-t border-zinc-800/50 flex-1 flex flex-col justify-between">
                    <p className="text-xs font-semibold truncate mb-2" title={item.name}>{item.name}</p>
                    
                    <div className="flex items-center justify-between mt-auto">
                      <span className="text-[10px] text-zinc-600 font-mono">
                        {item.type === 'file' ? `${(item.size / 1024).toFixed(1)} KB` : 'Pasta'}
                      </span>
                      
                      <div className="flex items-center gap-1">
                        {item.type === 'file' && (
                          <button 
                            onClick={(e) => { e.stopPropagation(); copyToNotion(item); }}
                            className="p-1.5 text-zinc-500 hover:text-indigo-400 rounded-lg hover:bg-indigo-400/10 transition-colors"
                            title="Copiar link Notion"
                          >
                            <Copy size={12} />
                          </button>
                        )}
                        <button 
                          onClick={(e) => {
                            e.stopPropagation();
                            setRenameValue(item.name);
                            setShowRenameModal(item);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-amber-400 rounded-lg hover:bg-amber-400/10 transition-colors"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                          className="p-1.5 text-zinc-500 hover:text-red-400 rounded-lg hover:bg-red-400/10 transition-colors"
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Modals */}
      <AnimatePresence>
        {selectedItem && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => setSelectedItem(null)}
              className="absolute inset-0 bg-black/95 backdrop-blur-xl"
            />
            
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }} 
              animate={{ opacity: 1, scale: 1, y: 0 }} 
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="relative bg-zinc-900 w-full max-w-5xl max-h-[90vh] rounded-3xl border border-zinc-800 shadow-2xl overflow-hidden flex flex-col"
            >
              {/* Modal Header */}
              <div className="p-4 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/50 backdrop-blur-md sticky top-0 z-10">
                <div className="flex items-center gap-3 overflow-hidden">
                  <div className="p-2 bg-zinc-800 rounded-lg shrink-0">
                    {isImage(selectedItem.name) ? <ExternalLink size={18} className="text-indigo-400" /> : 
                     isVideo(selectedItem.name) ? <FileVideo size={18} className="text-indigo-400" /> : 
                     <File size={18} className="text-zinc-400" />}
                  </div>
                  <div className="overflow-hidden">
                    <h3 className="font-bold text-sm truncate">{selectedItem.name}</h3>
                    <p className="text-[10px] text-zinc-500 font-mono">{(selectedItem.size / 1024).toFixed(1)} KB • {selectedItem.path}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <button 
                    onClick={() => copyToNotion(selectedItem)}
                    className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Copy size={14} />
                    <span className="hidden sm:inline">Copiar Link</span>
                  </button>
                  <a 
                    href={selectedItem.download_url || ''} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-xs font-bold transition-colors"
                  >
                    <Download size={14} />
                    <span className="hidden sm:inline">Download</span>
                  </a>
                  <button 
                    onClick={() => setSelectedItem(null)}
                    className="p-2 hover:bg-zinc-800 rounded-lg transition-colors text-zinc-400 hover:text-white"
                  >
                    <X size={20} />
                  </button>
                </div>
              </div>

              {/* Modal Content */}
              <div className="flex-1 overflow-auto p-6 flex items-center justify-center bg-zinc-950/30">
                {isImage(selectedItem.name) ? (
                  <img 
                    src={selectedItem.download_url || ''} 
                    alt={selectedItem.name}
                    className="max-w-full max-h-full object-contain rounded-lg shadow-2xl"
                    referrerPolicy="no-referrer"
                  />
                ) : isVideo(selectedItem.name) ? (
                  <video 
                    src={selectedItem.download_url || ''} 
                    controls 
                    autoPlay
                    className="max-w-full max-h-full rounded-lg shadow-2xl"
                  />
                ) : isTextFile(selectedItem.name) ? (
                  <div className="w-full h-full max-w-4xl bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden flex flex-col">
                    <div className="p-3 bg-zinc-800/50 border-b border-zinc-800 flex items-center justify-between">
                      <span className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest">Visualização de Texto</span>
                      {loadingText && <Loader2 size={14} className="animate-spin text-indigo-500" />}
                    </div>
                    <pre className="flex-1 p-6 text-sm font-mono text-zinc-300 overflow-auto whitespace-pre-wrap selection:bg-indigo-500/30">
                      {loadingText ? 'Carregando conteúdo...' : textContent || 'Nenhum conteúdo disponível.'}
                    </pre>
                  </div>
                ) : (
                  <div className="text-center space-y-4">
                    <File size={64} className="mx-auto text-zinc-800" />
                    <div>
                      <p className="text-zinc-400 font-medium">Este tipo de arquivo não possui pré-visualização direta.</p>
                      <p className="text-xs text-zinc-600">Use o botão de download para visualizar localmente.</p>
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          </div>
        )}

        {(showUploadModal || showNewFolderModal || showRenameModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                setShowUploadModal(false);
                setShowNewFolderModal(false);
                setShowRenameModal(null);
              }}
              className="absolute inset-0 bg-black/80 backdrop-blur-md"
            />
            
            <motion.div initial={{ opacity: 0, scale: 0.95, y: 20 }} animate={{ opacity: 1, scale: 1, y: 0 }} exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative bg-zinc-900 w-full max-w-md rounded-3xl border border-zinc-800 p-8 shadow-2xl"
            >
              <h2 className="text-xl font-bold mb-6 flex items-center gap-3">
                {showUploadModal && <><Upload className="text-indigo-500" /> Novo Asset</>}
                {showNewFolderModal && <><FolderPlus className="text-indigo-500" /> Nova Pasta</>}
                {showRenameModal && <><Edit3 className="text-amber-500" /> Renomear Item</>}
              </h2>

              <div className="space-y-6">
                {showUploadModal && (
                  <>
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl mb-4">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Destino</p>
                      <p className="text-xs font-medium text-zinc-300 truncate">
                        root / {currentPath || 'vazio'}
                      </p>
                    </div>

                    <div className="space-y-4">
                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Arquivo</label>
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className="relative border-2 border-dashed border-zinc-800 rounded-2xl overflow-hidden min-h-[160px] flex flex-col items-center justify-center cursor-pointer hover:border-indigo-500/50 hover:bg-indigo-500/5 transition-all group"
                        >
                          <input 
                            type="file" 
                            className="hidden" 
                            ref={fileInputRef} 
                            onChange={(e) => {
                              const file = e.target.files?.[0];
                              if (file) {
                                setUploadFile(file);
                                setUploadName(file.name);
                              }
                            }}
                          />
                          {uploadFile && uploadFile.type.startsWith('image/') ? (
                            <img 
                              src={URL.createObjectURL(uploadFile)} 
                              className="absolute inset-0 w-full h-full object-cover opacity-40 group-hover:opacity-60 transition-opacity"
                              alt="Preview"
                            />
                          ) : null}
                          
                          <div className="relative z-10 flex flex-col items-center">
                            <Upload className="mb-3 text-zinc-600 group-hover:text-indigo-400 transition-colors" size={32} />
                            <p className="text-sm font-medium text-zinc-400 px-4 text-center">
                              {uploadFile ? uploadFile.name : 'Clique para selecionar'}
                            </p>
                            {uploadFile && (
                              <p className="text-[10px] text-zinc-500 mt-1">
                                {(uploadFile.size / 1024).toFixed(1)} KB
                              </p>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome do Asset</label>
                        <input 
                          type="text" 
                          value={uploadName}
                          onChange={(e) => setUploadName(e.target.value)}
                          className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                          placeholder="nome-do-arquivo.ext"
                        />
                      </div>
                    </div>
                  </>
                )}

                {showNewFolderModal && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Nome da Pasta</label>
                    <input 
                      type="text" 
                      autoFocus
                      value={newFolderName}
                      onChange={(e) => setNewFolderName(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      placeholder="Ex: Personagens, Mapas..."
                    />
                  </div>
                )}

                {showRenameModal && (
                  <div className="space-y-2">
                    <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Novo Nome</label>
                    <input 
                      type="text" 
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      className="w-full bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                    />
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                  <button 
                    onClick={() => {
                      setShowUploadModal(false);
                      setShowNewFolderModal(false);
                      setShowRenameModal(null);
                    }}
                    className="flex-1 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 rounded-xl font-bold text-sm transition-all"
                  >
                    Cancelar
                  </button>
                  <button 
                    disabled={isSubmitting}
                    onClick={() => {
                      if (showUploadModal) handleUpload();
                      if (showNewFolderModal) handleCreateFolder();
                      if (showRenameModal) handleRename();
                    }}
                    className="flex-1 px-4 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl font-bold text-sm transition-all shadow-lg shadow-indigo-500/20 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 className="animate-spin" size={18} /> : 'Confirmar'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Footer */}
      <footer className="max-w-7xl mx-auto px-4 py-12 border-t border-zinc-900 mt-12">
        <div className="flex flex-col md:flex-row justify-between items-center gap-6 text-zinc-600 text-[10px] font-bold uppercase tracking-widest">
          <div className="flex items-center gap-6">
            <span>Repo: <span className="text-zinc-400">{config?.repo || '--'}</span></span>
            <span>Branch: <span className="text-zinc-400">{config?.branch || '--'}</span></span>
          </div>
          <p>© 2026 RPG Asset Manager • Powered by GitHub API</p>
        </div>
      </footer>
    </div>
  );
}

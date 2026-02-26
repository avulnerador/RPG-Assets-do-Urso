import React, { useState, useEffect, useRef, useMemo } from 'react';
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
  Loader2,
  LayoutGrid,
  List as ListIcon,
  ArrowUpDown,
  Filter,
  Move
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
  const [showMoveModal, setShowMoveModal] = useState<GitHubItem | null>(null);
  const [selectedItem, setSelectedItem] = useState<GitHubItem | null>(null);
  const [itemToDelete, setItemToDelete] = useState<GitHubItem | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [folders, setFolders] = useState<string[]>([]);
  const [loadingFolders, setLoadingFolders] = useState(false);
  
  // View & Sort States
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [sortBy, setSortBy] = useState<'name' | 'size' | 'type'>('name');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');
  
  // Form States
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [uploadName, setUploadName] = useState('');
  const [targetUploadPath, setTargetUploadPath] = useState('');
  const [newFolderName, setNewFolderName] = useState('');
  const [renameValue, setRenameValue] = useState('');
  const [targetMovePath, setTargetMovePath] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    fetchContents(currentPath);
  }, [currentPath]);

  useEffect(() => {
    if (showUploadModal) {
      setTargetUploadPath(currentPath);
      fetchFolders();
    }
  }, [showUploadModal]);

  useEffect(() => {
    if (showMoveModal) {
      setTargetMovePath(currentPath);
      fetchFolders();
    }
  }, [showMoveModal]);

  useEffect(() => {
    if (selectedItem && isTextFile(selectedItem.name) && selectedItem.download_url) {
      fetchTextContent(selectedItem.download_url);
    } else {
      setTextContent(null);
    }
  }, [selectedItem]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api?action=config');
      const data = await res.json();
      setConfig(data);
    } catch (err) {
      console.error("Error fetching config", err);
    }
  };

  const fetchFolders = async () => {
    setLoadingFolders(true);
    try {
      const res = await fetch(`/api?action=folders&t=${Date.now()}`);
      const data = await res.json();
      setFolders(data);
    } catch (err) {
      console.error("Error fetching folders", err);
    } finally {
      setLoadingFolders(false);
    }
  };

  const fetchContents = async (path: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api?action=contents&path=${encodeURIComponent(path)}&t=${Date.now()}`);
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Erro ao carregar conteúdo');
      }
      const data = await res.json();
      setItems(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => {
      // Always keep directories first
      if (a.type !== b.type) {
        return a.type === 'dir' ? -1 : 1;
      }

      let comparison = 0;
      if (sortBy === 'name') {
        comparison = a.name.localeCompare(b.name);
      } else if (sortBy === 'size') {
        comparison = (a.size || 0) - (b.size || 0);
      } else if (sortBy === 'type') {
        const extA = a.name.split('.').pop() || '';
        const extB = b.name.split('.').pop() || '';
        comparison = extA.localeCompare(extB);
      }

      return sortOrder === 'asc' ? comparison : -comparison;
    });
  }, [items, sortBy, sortOrder]);

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
      const res = await fetch('/api?action=folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path })
      });
      if (!res.ok) throw new Error('Falha ao criar pasta');
      setSuccess('Pasta criada com sucesso!');
      setShowNewFolderModal(false);
      setNewFolderName('');
      await fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleUpload = async () => {
    if (!uploadFile || !uploadName) return;
    
    // Get original extension
    const lastDotIndex = uploadFile.name.lastIndexOf('.');
    const extension = lastDotIndex !== -1 ? uploadFile.name.substring(lastDotIndex) : '';
    
    // Sanitize filename: allow alphanumeric, dots, dashes and underscores
    const sanitizedName = uploadName.replace(/[^a-zA-Z0-9._-]/g, '_') + extension;
    
    setIsSubmitting(true);
    try {
      const base64Content = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve((reader.result as string).split(',')[1]);
        reader.onerror = reject;
        reader.readAsDataURL(uploadFile);
      });

      const path = targetUploadPath ? `${targetUploadPath}/${sanitizedName}` : sanitizedName;
      
      const res = await fetch('/api?action=upload', {
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
      await fetchContents(currentPath);
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
      
      // Get original extension if it's a file
      const lastDotIndex = showRenameModal.name.lastIndexOf('.');
      const extension = (showRenameModal.type === 'file' && lastDotIndex !== -1) 
        ? showRenameModal.name.substring(lastDotIndex) 
        : '';
      
      const newName = renameValue + extension;
      const newPath = parentPath ? `${parentPath}/${newName}` : newName;

      const res = await fetch('/api?action=move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath, sha: showRenameModal.sha })
      });

      if (!res.ok) throw new Error('Falha ao renomear');
      setSuccess('Item renomeado com sucesso!');
      setShowRenameModal(null);
      setRenameValue('');
      await fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleMove = async () => {
    if (!showMoveModal) return;
    setIsSubmitting(true);
    try {
      const oldPath = showMoveModal.path;
      const newPath = targetMovePath ? `${targetMovePath}/${showMoveModal.name}` : showMoveModal.name;

      if (oldPath === newPath) {
        throw new Error('O destino é o mesmo que a origem');
      }

      const res = await fetch('/api?action=move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPath, newPath, sha: showMoveModal.sha })
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao mover');
      }

      setSuccess('Item movido com sucesso!');
      setShowMoveModal(null);
      await fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = (item: GitHubItem) => {
    setItemToDelete(item);
  };

  const confirmDelete = async () => {
    if (!itemToDelete) return;
    setIsSubmitting(true);
    try {
      const res = await fetch('/api?action=delete', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
          path: itemToDelete.path, 
          sha: itemToDelete.sha,
          type: itemToDelete.type
        })
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Falha ao excluir');
      }
      setSuccess('Item excluído com sucesso!');
      setItemToDelete(null);
      await fetchContents(currentPath);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setIsSubmitting(false);
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

        {/* Toolbar: Sorting & View Mode */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
          <div className="flex items-center gap-2 bg-zinc-900/30 p-1.5 rounded-xl border border-zinc-800/50 w-full sm:w-auto">
            <button 
              onClick={() => setViewMode('grid')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'grid' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <LayoutGrid size={14} />
              <span>Grade</span>
            </button>
            <button 
              onClick={() => setViewMode('list')}
              className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${viewMode === 'list' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-500/20' : 'text-zinc-500 hover:text-zinc-300'}`}
            >
              <ListIcon size={14} />
              <span>Lista</span>
            </button>
          </div>

          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="flex items-center gap-2 bg-zinc-900/30 px-3 py-2 rounded-xl border border-zinc-800/50 flex-1 sm:flex-none">
              <Filter size={14} className="text-zinc-500" />
              <select 
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as any)}
                className="bg-transparent text-xs font-bold text-zinc-300 focus:outline-none cursor-pointer appearance-none pr-4"
              >
                <option value="name" className="bg-zinc-900">Nome</option>
                <option value="size" className="bg-zinc-900">Tamanho</option>
                <option value="type" className="bg-zinc-900">Tipo</option>
              </select>
            </div>

            <button 
              onClick={() => setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc')}
              className="p-2 bg-zinc-900/30 hover:bg-zinc-800/50 rounded-xl border border-zinc-800/50 text-zinc-400 hover:text-indigo-400 transition-all"
              title={sortOrder === 'asc' ? 'Crescente' : 'Decrescente'}
            >
              <ArrowUpDown size={18} className={sortOrder === 'desc' ? 'rotate-180' : ''} />
            </button>
          </div>
        </div>

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
          ) : sortedItems.length === 0 ? (
            <div className="py-32 flex flex-col items-center justify-center gap-4 bg-zinc-900/20 rounded-3xl border border-dashed border-zinc-800">
              <Folder size={64} className="text-zinc-800" />
              <div className="text-center">
                <p className="text-lg font-bold text-zinc-600">Pasta Vazia</p>
                <p className="text-sm text-zinc-700">Comece criando uma pasta ou fazendo upload de assets.</p>
              </div>
            </div>
          ) : viewMode === 'grid' ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
              {sortedItems.map((item) => (
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
                            const lastDotIndex = item.name.lastIndexOf('.');
                            if (item.type === 'file' && lastDotIndex !== -1) {
                              setRenameValue(item.name.substring(0, lastDotIndex));
                            } else {
                              setRenameValue(item.name);
                            }
                            setShowRenameModal(item);
                          }}
                          className="p-1.5 text-zinc-500 hover:text-amber-400 rounded-lg hover:bg-amber-400/10 transition-colors"
                          title="Renomear"
                        >
                          <Edit3 size={12} />
                        </button>
                        <button 
                          onClick={(e) => { e.stopPropagation(); setShowMoveModal(item); }}
                          className="p-1.5 text-zinc-500 hover:text-indigo-400 rounded-lg hover:bg-indigo-400/10 transition-colors"
                          title="Mover"
                        >
                          <Move size={12} />
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
          ) : (
            <div className="bg-zinc-900/30 rounded-3xl border border-zinc-800/50 overflow-hidden backdrop-blur-sm">
              <div className="grid grid-cols-12 gap-4 px-6 py-4 border-b border-zinc-800/50 text-[10px] font-bold uppercase tracking-widest text-zinc-500">
                <div className="col-span-6 md:col-span-7">Nome</div>
                <div className="col-span-3 md:col-span-2 text-right">Tamanho</div>
                <div className="col-span-3 text-right">Ações</div>
              </div>

              <div className="divide-y divide-zinc-800/30">
                {sortedItems.map((item) => (
                  <div 
                    key={item.sha} 
                    className="grid grid-cols-12 gap-4 px-6 py-4 items-center hover:bg-white/[0.02] transition-colors group cursor-pointer"
                    onClick={() => item.type === 'dir' ? setCurrentPath(item.path) : setSelectedItem(item)}
                  >
                    <div className="col-span-6 md:col-span-7 flex items-center gap-3 overflow-hidden">
                      {item.type === 'dir' ? (
                        <Folder className="text-indigo-400 shrink-0" size={20} />
                      ) : isImage(item.name) ? (
                        <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-zinc-950 border border-zinc-800">
                          <img src={item.download_url || ''} className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                        </div>
                      ) : (
                        <File className="text-zinc-500 shrink-0" size={20} />
                      )}
                      <span className={`text-sm font-medium truncate ${item.type === 'dir' ? 'text-indigo-300' : 'text-zinc-300'}`}>
                        {item.name}
                      </span>
                    </div>
                    
                    <div className="col-span-3 md:col-span-2 text-right text-xs font-mono text-zinc-500">
                      {item.type === 'file' ? `${(item.size / 1024).toFixed(1)} KB` : '--'}
                    </div>

                    <div className="col-span-3 flex items-center justify-end gap-1">
                      {item.type === 'file' && (
                        <button 
                          onClick={(e) => { e.stopPropagation(); copyToNotion(item); }}
                          className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                          title="Copiar para Notion"
                        >
                          <Copy size={16} />
                        </button>
                      )}
                      <button 
                        onClick={(e) => {
                          e.stopPropagation();
                          const lastDotIndex = item.name.lastIndexOf('.');
                          if (item.type === 'file' && lastDotIndex !== -1) {
                            setRenameValue(item.name.substring(0, lastDotIndex));
                          } else {
                            setRenameValue(item.name);
                          }
                          setShowRenameModal(item);
                        }}
                        className="p-2 text-zinc-500 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-all"
                        title="Renomear"
                      >
                        <Edit3 size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); setShowMoveModal(item); }}
                        className="p-2 text-zinc-500 hover:text-indigo-400 hover:bg-indigo-400/10 rounded-lg transition-all"
                        title="Mover"
                      >
                        <Move size={16} />
                      </button>
                      <button 
                        onClick={(e) => { e.stopPropagation(); handleDelete(item); }}
                        className="p-2 text-zinc-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-all"
                        title="Excluir"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
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

        {(showUploadModal || showNewFolderModal || showRenameModal || showMoveModal) && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              onClick={() => {
                setShowUploadModal(false);
                setShowNewFolderModal(false);
                setShowRenameModal(null);
                setShowMoveModal(null);
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
                {showMoveModal && <><Move className="text-indigo-500" /> Mover Item</>}
              </h2>

              <div className="space-y-6">
                {showMoveModal && (
                  <div className="space-y-4">
                    <div className="p-4 bg-zinc-950/50 rounded-2xl border border-zinc-800">
                      <p className="text-[10px] font-bold text-zinc-500 uppercase tracking-widest mb-2">Item Selecionado</p>
                      <div className="flex items-center gap-3">
                        {showMoveModal.type === 'dir' ? <Folder className="text-indigo-400" size={20} /> : <File className="text-zinc-400" size={20} />}
                        <span className="text-sm font-medium truncate">{showMoveModal.name}</span>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-xs font-bold text-zinc-500 uppercase tracking-widest">Pasta de Destino</label>
                      <div className="relative bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3">
                        <select 
                          value={targetMovePath}
                          onChange={(e) => setTargetMovePath(e.target.value)}
                          className="w-full bg-transparent text-sm font-medium text-zinc-300 focus:outline-none appearance-none cursor-pointer pr-8"
                        >
                          {folders.map(f => (
                            <option key={f} value={f} className="bg-zinc-900 text-zinc-300">
                              {f === '' ? 'root (/) ' : `root / ${f}`}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-4 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                          {loadingFolders ? <Loader2 size={14} className="animate-spin" /> : <ChevronRight size={14} className="rotate-90" />}
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {showUploadModal && (
                  <>
                    <div className="p-3 bg-indigo-500/5 border border-indigo-500/10 rounded-2xl mb-4">
                      <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest mb-1">Destino do Upload</p>
                      <div className="relative">
                        <select 
                          value={targetUploadPath}
                          onChange={(e) => setTargetUploadPath(e.target.value)}
                          className="w-full bg-transparent text-xs font-medium text-zinc-300 focus:outline-none appearance-none cursor-pointer pr-8"
                        >
                          {folders.map(f => (
                            <option key={f} value={f} className="bg-zinc-900 text-zinc-300">
                              {f === '' ? 'root (/) ' : `root / ${f}`}
                            </option>
                          ))}
                        </select>
                        <div className="absolute right-0 top-1/2 -translate-y-1/2 pointer-events-none text-zinc-500">
                          {loadingFolders ? <Loader2 size={12} className="animate-spin" /> : <ChevronRight size={12} className="rotate-90" />}
                        </div>
                      </div>
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
                                // Set upload name without extension
                                const lastDotIndex = file.name.lastIndexOf('.');
                                if (lastDotIndex !== -1) {
                                  setUploadName(file.name.substring(0, lastDotIndex));
                                } else {
                                  setUploadName(file.name);
                                }
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
                        <div className="flex items-center gap-2">
                          <input 
                            type="text" 
                            value={uploadName}
                            onChange={(e) => setUploadName(e.target.value)}
                            className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                            placeholder="nome-do-arquivo"
                          />
                          {uploadFile && uploadFile.name.includes('.') && (
                            <div className="px-3 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-500">
                              {uploadFile.name.substring(uploadFile.name.lastIndexOf('.'))}
                            </div>
                          )}
                        </div>
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
                    <div className="flex items-center gap-2">
                      <input 
                        type="text" 
                        autoFocus
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        className="flex-1 bg-zinc-800 border border-zinc-700 rounded-xl px-4 py-3 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 transition-all"
                      />
                      {showRenameModal.type === 'file' && showRenameModal.name.includes('.') && (
                        <div className="px-3 py-3 bg-zinc-900 border border-zinc-800 rounded-xl text-xs font-mono text-zinc-500">
                          {showRenameModal.name.substring(showRenameModal.name.lastIndexOf('.'))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                <div className="flex gap-3 pt-4">
                    <button 
                      onClick={() => {
                        setShowUploadModal(false);
                        setShowNewFolderModal(false);
                        setShowRenameModal(null);
                        setShowMoveModal(null);
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
                        if (showMoveModal) handleMove();
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

      {/* Delete Confirmation Modal */}
      <AnimatePresence>
        {itemToDelete && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
            <motion.div 
              initial={{ opacity: 0, scale: 0.9, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.9, y: 20 }}
              className="w-full max-w-md bg-zinc-900 border border-zinc-800 rounded-3xl overflow-hidden shadow-2xl"
            >
              <div className="p-6">
                <div className="w-12 h-12 bg-red-500/10 rounded-2xl flex items-center justify-center mb-4">
                  <Trash2 className="text-red-500" size={24} />
                </div>
                <h3 className="text-xl font-bold text-white mb-2">Excluir {itemToDelete.type === 'dir' ? 'Pasta' : 'Arquivo'}</h3>
                <p className="text-zinc-400 text-sm mb-6 leading-relaxed">
                  Tem certeza que deseja excluir <span className="text-white font-medium">"{itemToDelete.name}"</span>? 
                  {itemToDelete.type === 'dir' && " Esta ação removerá a pasta (se estiver vazia ou contiver apenas o .gitkeep)."}
                  Esta ação não pode ser desfeita.
                </p>

                <div className="flex gap-3">
                  <button 
                    onClick={() => setItemToDelete(null)}
                    className="flex-1 py-3 px-4 rounded-2xl bg-zinc-800 hover:bg-zinc-700 text-white font-medium transition-colors"
                  >
                    Cancelar
                  </button>
                  <button 
                    onClick={confirmDelete}
                    disabled={isSubmitting}
                    className="flex-1 py-3 px-4 rounded-2xl bg-red-600 hover:bg-red-500 text-white font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {isSubmitting ? <Loader2 size={18} className="animate-spin" /> : "Excluir"}
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

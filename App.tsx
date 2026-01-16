
import React, { useState, useRef, useEffect } from 'react';
import { AppStep, Character, StoryConfig, StoryScene, StoryProject, User, ART_STYLES, GENRES, ASPECT_RATIOS, WRITING_STYLES, STORY_LENGTHS } from './types';
import { Button } from './components/Button';
import { generateImage, constructScenePrompt, analyzeStoryAndExtractCharacters, expandIdeaToStory, breakdownStoryIntoScenes } from './services/geminiService';
import { 
  Sparkles, Plus, Image as ImageIcon, Send, ArrowRight, Save, User as UserIcon, 
  History, Library, Wand2, Check, RotateCcw, Trash2, Download, 
  ChevronLeft, LayoutGrid, Type, Palette, Monitor, Zap, Play, Settings2,
  MoreVertical, Share2, Layers, FileText, PenLine, StopCircle, Upload, LogOut, KeyRound, Copy
} from 'lucide-react';

export default function App() {
  const [step, setStep] = useState<AppStep>(AppStep.AUTH);
  const [user, setUser] = useState<User | null>(null);
  const [projects, setProjects] = useState<StoryProject[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  
  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginName, setLoginName] = useState('');

  const [config, setConfig] = useState<StoryConfig>({
    title: 'قصة غير معنونة',
    style: ART_STYLES[0],
    genre: GENRES[0],
    aspectRatio: '16:9',
    sceneCount: 5,
    storyTextRaw: ''
  });
  
  const [ideaText, setIdeaText] = useState('');
  const [isGeneratingIdea, setIsGeneratingIdea] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [scenes, setScenes] = useState<StoryScene[]>([]);
  
  // Batch Generation State
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const stopBatchRef = useRef(false);

  // File Upload State
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [activeCharUploadId, setActiveCharUploadId] = useState<string | null>(null);

  // --- AUTH & PERSISTENCE ---

  useEffect(() => {
    // Check for logged in user (session)
    const savedUser = localStorage.getItem('hakawati_user');
    if (savedUser) {
      setUser(JSON.parse(savedUser));
      setStep(AppStep.SETUP);
    }

    // Load all projects
    const savedProjects = localStorage.getItem('hakawati_projects');
    if (savedProjects) setProjects(JSON.parse(savedProjects));
  }, []);

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginName.trim()) return;

    // Load Users Database
    const usersDb: User[] = JSON.parse(localStorage.getItem('hakawati_users_db') || '[]');
    let targetUser: User | undefined;

    // If email is provided, try to find existing account
    if (loginEmail.trim()) {
      targetUser = usersDb.find(u => u.email.toLowerCase() === loginEmail.toLowerCase());
    }

    if (targetUser) {
      // User found! Update name if changed
      targetUser.name = loginName; 
      // Update in DB
      const updatedDb = usersDb.map(u => u.id === targetUser!.id ? targetUser! : u);
      localStorage.setItem('hakawati_users_db', JSON.stringify(updatedDb));
    } else {
      // Create new user
      targetUser = {
        id: loginEmail ? loginEmail.toLowerCase() : crypto.randomUUID(),
        name: loginName,
        email: loginEmail,
        avatar: `https://api.dicebear.com/7.x/micah/svg?seed=${loginName}`
      };
      // Save to DB
      usersDb.push(targetUser);
      localStorage.setItem('hakawati_users_db', JSON.stringify(usersDb));
    }
    
    // Set active session
    setUser(targetUser);
    localStorage.setItem('hakawati_user', JSON.stringify(targetUser));
    setStep(AppStep.SETUP);
  };

  const handleLogout = () => {
    localStorage.removeItem('hakawati_user');
    setUser(null);
    setStep(AppStep.AUTH);
  };

  const saveToStorage = (updatedProjects: StoryProject[]) => {
    setProjects(updatedProjects);
    localStorage.setItem('hakawati_projects', JSON.stringify(updatedProjects));
  };

  const persistCurrentState = () => {
    if (!currentProjectId || !user) return;
    
    // Ensure project belongs to current user
    const updated = projects.map(p => p.id === currentProjectId ? {
      ...p,
      config,
      characters,
      scenes,
      updatedAt: Date.now()
    } : p);
    
    saveToStorage(updated);
  };

  const startNewProject = (manual: boolean = false) => {
    if (!user) return;
    const newId = crypto.randomUUID();
    const newProj: StoryProject = {
      id: newId,
      userId: user.id, // Linked to the persistent User ID
      title: manual ? 'قصة يدوية جديدة' : 'مغامرة جديدة',
      config: { ...config, storyTextRaw: '', title: manual ? 'قصة يدوية جديدة' : 'مغامرة جديدة' },
      characters: [],
      scenes: [],
      updatedAt: Date.now()
    };
    
    const updatedProjects = [newProj, ...projects];
    saveToStorage(updatedProjects);
    setCurrentProjectId(newId);
    setCharacters([]);
    setScenes([]);
    
    if (manual) {
      setConfig(prev => ({ ...prev, storyTextRaw: '', title: 'قصة يدوية جديدة' }));
      setStep(AppStep.STORY_PREVIEW);
    } else {
      setStep(AppStep.IDEA_GENERATOR);
    }
  };

  const loadProject = (p: StoryProject) => {
    setCurrentProjectId(p.id);
    setConfig(p.config);
    setCharacters(p.characters);
    setScenes(p.scenes);
    setStep(AppStep.INPUT_STORY);
  };

  const deleteProject = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('هل أنت متأكد من حذف هذه القصة؟')) {
      const updated = projects.filter(p => p.id !== id);
      saveToStorage(updated);
      if (currentProjectId === id) {
        setCurrentProjectId(null);
        setStep(AppStep.SETUP);
      }
    }
  };

  // --- CORE LOGIC ---

  const handleGenerateIdea = async () => {
    if (!ideaText.trim()) {
      alert("يرجى إدخال فكرة أولاً.");
      return;
    }
    setIsGeneratingIdea(true);
    try {
      const result = await expandIdeaToStory(ideaText, config.genre, config.style, STORY_LENGTHS[1]);
      if (!result.story) throw new Error("لم يتم إرجاع نص من الموديل");
      
      setConfig(prev => ({ 
        ...prev, 
        storyTextRaw: result.story,
        title: result.title || prev.title 
      }));
      setStep(AppStep.STORY_PREVIEW);
    } catch (e) {
      console.error(e);
      alert("عذراً، حدث خطأ أثناء توليد القصة. تأكد من إعداد مفتاح API بشكل صحيح.");
    } finally {
      setIsGeneratingIdea(false);
    }
  };

  const handleAnalyzeStory = async () => {
    if (!config.storyTextRaw.trim()) {
      alert("يرجى كتابة نص القصة أولاً.");
      return;
    }
    setIsAnalyzing(true);
    try {
      const [extractedChars, initialScenes] = await Promise.all([
        analyzeStoryAndExtractCharacters(config.storyTextRaw, config.style),
        breakdownStoryIntoScenes(config.storyTextRaw)
      ]);
      
      setScenes(initialScenes);
      
      // Use isCharacterSheet = true for the specific visual style requested
      const charsWithAvatars = await Promise.all(extractedChars.map(async (char) => {
        try {
          const avatarUrl = await generateImage(char.visualPrompt, "3:4", true);
          return { ...char, avatarUrl };
        } catch { return char; }
      }));

      setCharacters(charsWithAvatars);
      setStep(AppStep.INPUT_STORY);
      setTimeout(() => persistCurrentState(), 500);
    } catch (e) {
      console.error(e);
      alert("فشل تحليل القصة.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerateSceneImage = async (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoadingImage: true } : s));
    try {
      const prompt = constructScenePrompt(scene.text, characters, config.style);
      const imageUrl = await generateImage(prompt, config.aspectRatio, false);
      setScenes(prev => {
        // Save both imageUrl AND imagePrompt for later use (video generation)
        const next = prev.map(s => s.id === sceneId ? { ...s, imageUrl, imagePrompt: prompt, isLoadingImage: false } : s);
        setTimeout(() => persistCurrentState(), 0);
        return next;
      });
    } catch (e) {
      console.error(e);
      setScenes(prev => prev.map(s => s.id === sceneId ? { ...s, isLoadingImage: false } : s));
      alert("فشل توليد الصورة للمشهد.");
    }
  };

  const handleToggleBatchGeneration = async () => {
    if (isBatchGenerating) {
      stopBatchRef.current = true;
      setIsBatchGenerating(false);
      return;
    }
    setIsBatchGenerating(true);
    stopBatchRef.current = false;
    for (const scene of scenes) {
      if (stopBatchRef.current) break;
      if (!scene.imageUrl) {
        await handleGenerateSceneImage(scene.id);
      }
    }
    setIsBatchGenerating(false);
    stopBatchRef.current = false;
  };

  const handleRegenerateCharacter = async (charId: string) => {
    const char = characters.find(c => c.id === charId);
    if (!char) return;
    setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isLoading: true } : c));
    try {
      // isCharacterSheet = true
      const avatarUrl = await generateImage(char.visualPrompt, "3:4", true);
      setCharacters(prev => {
        const next = prev.map(c => c.id === charId ? { ...c, avatarUrl, isLoading: false } : c);
        setTimeout(() => persistCurrentState(), 0);
        return next;
      });
    } catch (error) {
      setCharacters(prev => prev.map(c => c.id === charId ? { ...c, isLoading: false } : c));
      alert("فشل إعادة توليد الشخصية");
    }
  };

  const triggerUpload = (charId: string) => {
    setActiveCharUploadId(charId);
    if (fileInputRef.current) fileInputRef.current.click();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0] && activeCharUploadId) {
      const file = e.target.files[0];
      const reader = new FileReader();
      reader.onloadend = () => {
        const base64 = reader.result as string;
        setCharacters(prev => {
          const next = prev.map(c => c.id === activeCharUploadId ? { ...c, avatarUrl: base64 } : c);
          setTimeout(() => persistCurrentState(), 0);
          return next;
        });
        setActiveCharUploadId(null);
        if (fileInputRef.current) fileInputRef.current.value = '';
      };
      reader.readAsDataURL(file);
    }
  };

  const downloadImage = (url: string | undefined, name: string) => {
    if (!url) return;
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.png`;
    link.click();
  };

  const copyToClipboard = (text: string | undefined) => {
    if (!text) return;
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).catch(err => {
        console.error('Failed to copy: ', err);
        alert("فشل النسخ إلى الحافظة. تأكد من أن الموقع يعمل في بيئة آمنة (HTTPS).");
      });
    } else {
      // Fallback for non-secure contexts
      const textArea = document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      try {
        document.execCommand('copy');
      } catch (err) {
        console.error('Fallback: Oops, unable to copy', err);
      }
      document.body.removeChild(textArea);
    }
  };

  // --- RENDERING VIEWS ---

  const renderAuth = () => (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] right-[-10%] w-[60%] h-[60%] bg-purple-900/20 blur-[150px] rounded-full"></div>
      
      <div className="glass p-10 rounded-[2.5rem] w-full max-w-md relative z-10 border border-white/10 shadow-2xl">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-black text-white mb-2">HAKAWATI<span className="text-purple-500">.</span></h1>
          <p className="text-zinc-500">سجل دخولك لحفظ قصصك ومتابعتها</p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest mr-2">الاسم المستعار</label>
            <div className="relative">
              <input 
                type="text" 
                value={loginName}
                onChange={(e) => setLoginName(e.target.value)}
                placeholder="أدخل اسمك..."
                className="w-full bg-black/50 border border-zinc-800 rounded-xl p-4 pr-12 text-white outline-none focus:border-purple-500 transition-colors"
                required
              />
              <UserIcon size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600" />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="text-xs font-bold text-zinc-400 uppercase tracking-widest mr-2">البريد الإلكتروني (لاسترجاع الحساب)</label>
             <div className="relative">
              <input 
                type="email" 
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="هام لاسترجاع القصص المحفوظة..."
                className="w-full bg-black/50 border border-zinc-800 rounded-xl p-4 pr-12 text-white outline-none focus:border-purple-500 transition-colors"
              />
              <KeyRound size={18} className="absolute right-4 top-1/2 -translate-y-1/2 text-zinc-600" />
            </div>
          </div>

          <Button type="submit" variant="glow" className="w-full py-4 text-lg rounded-xl">
             دخول الاستوديو <ArrowRight size={20} />
          </Button>
        </form>
      </div>
    </div>
  );

  const renderLanding = () => (
    <div className="relative min-h-screen flex flex-col items-center justify-center overflow-hidden bg-[#050505]">
      <div className="absolute top-4 right-4 z-20 flex items-center gap-4">
         <div className="flex items-center gap-3 glass px-4 py-2 rounded-full">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-purple-500 to-blue-500 p-[2px]">
               <img src={user?.avatar} className="w-full h-full rounded-full bg-black" />
            </div>
            <span className="text-sm font-bold text-white">{user?.name}</span>
         </div>
         <button onClick={handleLogout} className="p-3 rounded-full glass hover:bg-red-500/10 hover:text-red-400 transition-colors" title="تسجيل خروج">
            <LogOut size={18} />
         </button>
      </div>

      <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-purple-600/10 blur-[120px] rounded-full animate-pulse"></div>
      <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-600/10 blur-[120px] rounded-full animate-pulse" style={{animationDelay: '2s'}}></div>
      
      <div className="z-10 text-center px-6 max-w-5xl">
        <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full glass border border-white/5 text-purple-400 text-xs font-bold mb-8 tracking-widest uppercase">
          <Zap size={14} fill="currentColor" /> Powered by Gemini 3.0 Pro
        </div>
        
        <h1 className="text-7xl lg:text-9xl font-black text-white mb-8 tracking-tighter leading-none">
          HAKAWATI<br/>
          <span className="text-gradient">STUDIO</span>
        </h1>
        
        <p className="text-zinc-400 text-xl lg:text-2xl mb-12 max-w-3xl mx-auto leading-relaxed font-light">
          حوّل خيالك إلى تجربة بصرية سينمائية. نظام متطور لإنشاء القصص المصورة بنمط الأنيمي الملحمي.
        </p>
        
        <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
          <Button onClick={() => startNewProject(false)} variant="glow" className="text-lg px-8 py-5">
            توليد ذكي <Sparkles size={20} />
          </Button>
          <Button onClick={() => startNewProject(true)} variant="secondary" className="text-lg px-8 py-5 rounded-full border-zinc-800 hover:border-purple-500/50">
            كتابة يدوية <PenLine size={20} />
          </Button>
          <Button onClick={() => setStep(AppStep.GALLERY)} variant="ghost" className="text-lg px-8 py-5">
            مكتبة أعمالي <Library size={20} />
          </Button>
        </div>
      </div>
    </div>
  );

  const renderGallery = () => {
    // Filter projects for current user
    const userProjects = projects.filter(p => p.userId === user?.id);

    return (
      <div className="min-h-screen bg-[#050505] p-8 lg:p-16">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-6 mb-16">
            <div>
              <h2 className="text-5xl font-black text-white mb-3">مكتبة الإنتاج</h2>
              <p className="text-zinc-500 text-lg">أهلاً بك مجدداً، {user?.name}</p>
            </div>
            <Button onClick={() => setStep(AppStep.SETUP)} variant="ghost" className="rounded-2xl">
               العودة للرئيسية <ChevronLeft size={20} />
            </Button>
          </div>
          
          {userProjects.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-40 glass rounded-[3rem] border-dashed border-zinc-800">
              <div className="p-8 bg-zinc-900/50 rounded-full mb-6">
                <History size={48} className="text-zinc-700" />
              </div>
              <p className="text-zinc-500 text-xl font-medium">لم يتم العثور على مسودات سابقة</p>
              <Button onClick={() => startNewProject(false)} variant="primary" className="mt-8">ابدأ أول قصة الآن</Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
              {userProjects.map(p => (
                <div 
                  key={p.id} 
                  onClick={() => loadProject(p)}
                  className="group relative bg-zinc-900/40 rounded-[2rem] overflow-hidden border border-zinc-800/50 hover:border-purple-500/50 transition-all duration-500 cursor-pointer"
                >
                  <div className="aspect-[16/10] bg-zinc-800 relative overflow-hidden">
                    {p.scenes.find(s => s.imageUrl)?.imageUrl ? (
                      <img src={p.scenes.find(s => s.imageUrl)!.imageUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : p.characters[0]?.avatarUrl ? (
                      <img src={p.characters[0].avatarUrl} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-zinc-900"><ImageIcon size={40} /></div>
                    )}
                    <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/20 to-transparent" />
                    <div className="absolute bottom-6 right-6">
                      <span className="px-3 py-1 bg-purple-600 text-white text-[10px] font-bold rounded-full uppercase tracking-widest">{p.config.genre.split(' ')[0]}</span>
                    </div>
                  </div>
                  <div className="p-8">
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="text-xl font-bold text-white group-hover:text-purple-400 transition-colors truncate flex-1">{p.config.title}</h3>
                      <button 
                        onClick={(e) => deleteProject(p.id, e)} 
                        className="p-2 text-zinc-600 hover:text-red-500 transition-colors flex-shrink-0"
                        title="حذف القصة"
                      >
                        <Trash2 size={18}/>
                      </button>
                    </div>
                    <div className="flex justify-between items-center text-zinc-500 text-sm">
                      <div className="flex items-center gap-2"><LayoutGrid size={14} /> {p.scenes.length} مشهد</div>
                      <div className="text-[10px] uppercase tracking-tighter">{new Date(p.updatedAt).toLocaleDateString('ar-EG')}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderWorkspace = () => (
    <div className="min-h-screen bg-[#050505] flex flex-col">
      {/* Workspace Header */}
      <header className="h-20 glass border-b border-white/5 px-8 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-6">
          <button onClick={() => setStep(AppStep.GALLERY)} className="p-2 hover:bg-zinc-800 rounded-xl transition-colors"><ChevronLeft size={24} /></button>
          <div className="h-8 w-[1px] bg-zinc-800"></div>
          <div>
            <input 
              value={config.title}
              onChange={(e) => setConfig({...config, title: e.target.value})}
              onBlur={persistCurrentState}
              className="bg-transparent text-xl font-bold text-white outline-none w-64 focus:text-purple-400 transition-colors"
            />
            <div className="flex items-center gap-2 text-[10px] text-zinc-500 font-bold uppercase tracking-tighter">
              <span className="text-purple-500">Live Studio</span> • {config.style.split(' ')[0]} Mode
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <Button 
            onClick={handleToggleBatchGeneration} 
            variant={isBatchGenerating ? "danger" : "glow"} 
            className="px-6 py-2 text-sm rounded-xl min-w-[160px]"
          >
            {isBatchGenerating ? (
              <>إيقاف التوليد <StopCircle size={16} /></>
            ) : (
              <>توليد كل الصور <Layers size={16} /></>
            )}
          </Button>

          <Button onClick={persistCurrentState} variant="secondary" className="px-6 py-2 text-sm rounded-xl">
            <Save size={16}/> حفظ المسودة
          </Button>
        </div>
      </header>

      <div className="flex-1 flex flex-col overflow-y-auto">
        <main className="flex-1 p-8 lg:p-12 space-y-12">
          {scenes.length === 0 ? (
            <div className="max-w-3xl mx-auto py-20">
              <div className="glass p-12 rounded-[3rem] text-center border border-white/5 relative overflow-hidden">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-purple-500 to-blue-500"></div>
                <div className="w-20 h-20 bg-zinc-900 rounded-3xl flex items-center justify-center mx-auto mb-8 shadow-2xl">
                  <FileText size={32} className="text-purple-400" />
                </div>
                <h3 className="text-3xl font-black text-white mb-6">جاهز لبدء الإنتاج؟</h3>
                <textarea 
                   value={config.storyTextRaw}
                   onChange={(e) => setConfig({...config, storyTextRaw: e.target.value})}
                   placeholder="أدخل نص القصة الكامل هنا..."
                   className="w-full h-80 bg-black/50 border border-zinc-800 p-8 rounded-[2rem] text-zinc-300 outline-none focus:border-purple-500/50 transition-all mb-8 resize-none text-lg leading-relaxed font-light"
                />
                <Button 
                  onClick={handleAnalyzeStory} 
                  isLoading={isAnalyzing}
                  variant="glow"
                  className="mx-auto px-16"
                >
                  بدء التحليل البصري <Sparkles size={20} />
                </Button>
              </div>
            </div>
          ) : (
            <div className="max-w-6xl mx-auto pb-32">
              <input type="file" ref={fileInputRef} className="hidden" accept="image/*" onChange={handleFileUpload} />

               {/* 1. SETTINGS SECTION (Moved Here) */}
              <section className="mb-24">
                <div className="text-center mb-12">
                   <h3 className="text-3xl font-black text-white inline-flex items-center gap-4">
                     <span className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 text-lg border border-purple-500/30 font-mono">1</span>
                     إعدادات المشروع
                   </h3>
                </div>
                
                <div className="glass p-8 rounded-[2rem] border border-white/5 grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div className="space-y-4">
                      <label className="text-xs text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Monitor size={14} /> نسبة أبعاد المشاهد
                      </label>
                      <div className="grid grid-cols-3 gap-3">
                        {ASPECT_RATIOS.map(ar => (
                          <button 
                            key={ar.value}
                            onClick={() => { setConfig({...config, aspectRatio: ar.value}); setTimeout(persistCurrentState, 0); }}
                            className={`py-4 px-2 text-xs font-bold rounded-xl border transition-all flex flex-col items-center gap-2 ${config.aspectRatio === ar.value ? 'bg-white text-black border-white' : 'bg-zinc-900 text-zinc-500 border-zinc-800 hover:border-zinc-700'}`}
                          >
                            <span className="text-lg">{ar.value === '16:9' ? '▭' : ar.value === '9:16' ? '▯' : '□'}</span>
                            {ar.value}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="space-y-4">
                      <label className="text-xs text-zinc-400 font-bold uppercase tracking-widest flex items-center gap-2">
                        <Palette size={14} /> النمط البصري العام
                      </label>
                      <div className="relative group">
                        <select 
                          value={config.style}
                          onChange={(e) => setConfig({...config, style: e.target.value})}
                          className="w-full bg-zinc-900 border border-zinc-800 p-4 rounded-xl text-white outline-none text-sm appearance-none cursor-pointer focus:border-purple-500 transition-colors"
                        >
                          {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                        <MoreVertical size={16} className="absolute left-4 top-1/2 -translate-y-1/2 text-zinc-600 pointer-events-none" />
                      </div>
                      <p className="text-[10px] text-zinc-600">يؤثر هذا النمط على كل المشاهد، بينما تحافظ الشخصيات على تصميمها الخاص.</p>
                    </div>
                </div>
              </section>

              {/* 2. CHARACTERS SECTION */}
              <section className="mb-24">
                <div className="text-center mb-12">
                   <h3 className="text-3xl font-black text-white inline-flex items-center gap-4">
                     <span className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 text-lg border border-purple-500/30 font-mono">2</span>
                     شخصيات القصة
                   </h3>
                   <p className="text-zinc-500 mt-2">تصاميم تفصيلية مع إضاءة سينمائية وخلفيات داكنة</p>
                </div>
                
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                   {characters.map(char => (
                      <div key={char.id} className="group relative bg-[#0a0a0a] rounded-[2rem] overflow-hidden border border-white/5 hover:border-purple-500/30 transition-all duration-500 shadow-2xl">
                        {/* Image Section - Taller aspect ratio for Character Sheet look */}
                        <div className="relative aspect-[3/4] w-full bg-zinc-900 overflow-hidden">
                           {char.isLoading ? (
                             <div className="absolute inset-0 flex items-center justify-center bg-black/80 z-20">
                                <div className="w-10 h-10 border-2 border-purple-500 border-t-transparent rounded-full animate-spin"></div>
                             </div>
                           ) : char.avatarUrl ? (
                               <img src={char.avatarUrl} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                           ) : (
                               <div className="w-full h-full flex items-center justify-center text-zinc-700 bg-[#0f0f10]"><UserIcon size={48} /></div>
                           )}
                           
                           {/* Gradient Overlays */}
                           <div className="absolute inset-0 bg-gradient-to-t from-[#0a0a0a] via-transparent to-transparent opacity-90"></div>
                           
                           {/* Name Overlay */}
                           <div className="absolute bottom-6 inset-x-0 text-center z-10 px-4">
                              <h3 className="text-2xl font-black text-white drop-shadow-[0_4px_4px_rgba(0,0,0,0.8)] uppercase tracking-wider">{char.name}</h3>
                              <div className="h-0.5 w-12 bg-purple-500 mx-auto mt-2"></div>
                           </div>
                        </div>

                        <div className="p-6 relative bg-[#0a0a0a]">
                          {/* Description Box */}
                          <div className="bg-[#151518] border border-white/5 rounded-xl p-4 mb-6 shadow-inner h-24 overflow-y-auto custom-scrollbar">
                            <p className="text-[10px] text-zinc-400 text-center leading-relaxed font-medium">
                              {char.description}
                            </p>
                          </div>

                          {/* Action Buttons */}
                          <div className="grid grid-cols-2 gap-3 mb-3">
                             <Button 
                              variant="secondary" 
                              className="px-0 text-[10px] h-10 rounded-xl bg-zinc-900/80 hover:bg-zinc-800" 
                              onClick={() => triggerUpload(char.id)}
                             >
                                <Upload size={14} /> رفع صورة
                             </Button>
                             <Button 
                              variant="secondary" 
                              className="px-0 text-[10px] h-10 rounded-xl bg-zinc-900/80 hover:bg-zinc-800" 
                              onClick={() => downloadImage(char.avatarUrl, char.name)}
                             >
                                <Download size={14} /> تحميل
                             </Button>
                          </div>
                          
                          <div className="grid grid-cols-2 gap-3 mb-3">
                             <Button 
                              variant="secondary" 
                              className="px-0 text-[10px] h-10 rounded-xl bg-zinc-900/80 hover:bg-zinc-800" 
                              onClick={() => copyToClipboard(char.visualPrompt)}
                              title="نسخ الوصف لاستخدامه في أدوات الفيديو"
                             >
                                <Copy size={14} /> نسخ الوصف
                             </Button>
                              <Button 
                                variant="glow" 
                                className="px-0 w-full h-10 text-[10px] rounded-xl shadow-lg shadow-purple-900/20" 
                                onClick={() => handleRegenerateCharacter(char.id)}
                                isLoading={char.isLoading}
                              >
                                <RotateCcw size={14} /> إعادة إنشاء
                              </Button>
                          </div>
                        </div>
                      </div>
                   ))}
                   
                   <button 
                      onClick={() => setCharacters([...characters, { id: crypto.randomUUID(), name: 'شخصية جديدة', description: 'وصف الشخصية...', visualPrompt: 'Character description' }])}
                      className="group relative h-full min-h-[500px] bg-zinc-900/20 border-2 border-dashed border-zinc-800 rounded-[2rem] hover:border-purple-500 hover:bg-purple-500/5 transition-all flex flex-col items-center justify-center gap-6"
                    >
                      <div className="w-20 h-20 rounded-full bg-zinc-900 flex items-center justify-center text-zinc-500 group-hover:text-purple-400 group-hover:scale-110 transition-all border border-zinc-800 group-hover:border-purple-500/30">
                        <Plus size={32} />
                      </div>
                      <span className="font-bold text-zinc-500 group-hover:text-white text-lg">أضف شخصية جديدة</span>
                    </button>
                </div>
              </section>

              {/* 3. SCENES SECTION */}
              <section className="mb-24">
                 <div className="text-center mb-16">
                    <h3 className="text-3xl font-black text-white inline-flex items-center gap-4">
                       <span className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 text-lg border border-purple-500/30 font-mono">3</span>
                       مشاهد القصة
                    </h3>
                    <p className="text-zinc-500 mt-2">عدل النصوص وأنشئ صوراً فريدة لكل مشهد</p>
                 </div>
                 
                 <div className="space-y-24">
                  {scenes.map((scene, idx) => (
                    <div key={scene.id} className="scene-card relative flex flex-col lg:flex-row gap-12 items-start">
                      {/* Scene Index Line */}
                      <div className="absolute -right-16 top-0 bottom-0 hidden lg:flex flex-col items-center">
                        <div className={`w-8 h-8 rounded-full border-2 flex items-center justify-center text-[10px] font-black ${scene.imageUrl ? 'bg-purple-600 border-purple-600 text-white' : 'border-zinc-800 text-zinc-600'}`}>
                          {idx + 1}
                        </div>
                        <div className="flex-1 w-[2px] bg-gradient-to-b from-zinc-800 to-transparent my-4"></div>
                      </div>

                      <div className="flex-1 space-y-6">
                        <div className="flex items-center gap-4">
                           <span className="text-[10px] font-black uppercase tracking-[0.3em] text-purple-500">مشهد #{idx + 1}</span>
                           <div className="h-[1px] flex-1 bg-zinc-900"></div>
                        </div>
                        <div className="text-xs text-zinc-500 mb-1">نص المشهد (قابل للتعديل):</div>
                        <textarea 
                          value={scene.text}
                          onChange={(e) => {
                             setScenes(prev => prev.map((s, i) => i === idx ? { ...s, text: e.target.value } : s));
                          }}
                          onBlur={persistCurrentState}
                          className="w-full bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 text-white text-lg font-light leading-relaxed outline-none focus:border-purple-500/50 transition-all resize-none h-auto min-h-[160px]"
                        />
                        <div className="flex items-center justify-between">
                            <div className="text-[10px] text-zinc-600">أبعاد الصورة للمشهد: <span className="text-white font-bold">{config.aspectRatio}</span></div>
                            <div className="flex items-center gap-4">
                              <Button 
                                onClick={() => copyToClipboard(scene.imagePrompt)}
                                disabled={!scene.imagePrompt}
                                variant="secondary"
                                className="rounded-xl px-4 py-2 text-xs"
                                title="نسخ الوصف لاستخدامه في أدوات الفيديو"
                              >
                                <Copy size={14} /> نسخ الوصف
                              </Button>
                              <Button 
                                onClick={() => {
                                   const link = document.createElement('a');
                                   link.href = scene.imageUrl!;
                                   link.download = `scene-${idx+1}.png`;
                                   link.click();
                                }}
                                disabled={!scene.imageUrl}
                                variant="secondary"
                                className="rounded-xl px-6 py-2 text-xs"
                              >
                                <Download size={14} /> تحميل
                              </Button>
                              <Button 
                                onClick={() => handleGenerateSceneImage(scene.id)}
                                isLoading={scene.isLoadingImage}
                                variant="glow"
                                className="rounded-xl px-8 py-2 text-xs"
                              >
                                <Sparkles size={14} /> {scene.imageUrl ? 'إعادة إنشاء الصورة' : 'إنشاء الصورة'}
                              </Button>
                            </div>
                        </div>
                      </div>

                      <div className={`w-full lg:w-[500px] shrink-0 rounded-[2rem] overflow-hidden bg-zinc-900 border border-white/5 relative shadow-2xl group/img ${config.aspectRatio === '16:9' ? 'aspect-video' : 'aspect-square'}`}>
                        {scene.isLoadingImage ? (
                          <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 z-20">
                            <div className="relative">
                              <div className="w-16 h-16 rounded-full border-t-2 border-purple-500 animate-spin"></div>
                              <div className="absolute inset-0 flex items-center justify-center">
                                <Zap size={20} className="text-purple-500 animate-pulse" />
                              </div>
                            </div>
                            <span className="mt-6 text-[10px] text-purple-400 font-black tracking-[0.2em] animate-pulse">RENDERING ASSET</span>
                          </div>
                        ) : scene.imageUrl ? (
                          <>
                            <img src={scene.imageUrl} className="w-full h-full object-cover group-hover/img:scale-105 transition-transform duration-1000" />
                          </>
                        ) : (
                          <div className="w-full h-full flex flex-col items-center justify-center text-zinc-800 gap-4">
                             <div className="p-6 bg-zinc-950/50 rounded-full border border-white/5">
                               <ImageIcon size={48} strokeWidth={1} />
                             </div>
                             <p className="text-[10px] font-black uppercase tracking-widest text-zinc-700">سيتم عرض الصورة هنا</p>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                  
                  <div className="py-20 flex justify-center border-t border-zinc-900">
                     <button 
                      onClick={() => setScenes([...scenes, { id: crypto.randomUUID(), text: 'أدخل وصف المشهد الإضافي...', isLoadingImage: false }])}
                      className="flex items-center gap-4 text-zinc-500 hover:text-white transition-all group"
                     >
                       <div className="w-12 h-12 rounded-full border border-dashed border-zinc-800 flex items-center justify-center group-hover:border-purple-500 group-hover:bg-purple-500/10 transition-all">
                        <Plus size={20} />
                       </div>
                       <span className="font-bold text-sm tracking-widest">إضافة مشهد يدوي</span>
                     </button>
                  </div>
                 </div>
              </section>

              {/* 4. ANIMATION PROMPTS SECTION */}
              <section className="border-t border-white/5 pt-24">
                <div className="text-center mb-12">
                   <h3 className="text-3xl font-black text-white inline-flex items-center gap-4">
                     <span className="w-10 h-10 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400 text-lg border border-purple-500/30 font-mono">4</span>
                     تجهيز التحريك (Animation Prep)
                   </h3>
                   <p className="text-zinc-500 mt-2">استخدم هذه الموارد لتحريك المشاهد في أدوات خارجية مثل Runway Gen-2 أو Pika Labs</p>
                </div>

                <div className="grid grid-cols-1 gap-4">
                  {scenes.filter(s => s.imageUrl).length === 0 ? (
                     <div className="text-center py-12 border border-dashed border-zinc-800 rounded-3xl bg-zinc-900/20">
                        <p className="text-zinc-500">قم بتوليد صور المشاهد أولاً لتظهر هنا أدوات التحريك</p>
                     </div>
                  ) : (
                    scenes.filter(s => s.imageUrl).map((scene, idx) => (
                      <div key={scene.id} className="bg-zinc-900/30 border border-white/5 p-6 rounded-2xl flex flex-col md:flex-row gap-6">
                         {/* Thumbnail */}
                         <div className="w-full md:w-64 aspect-video bg-black rounded-xl overflow-hidden shrink-0 border border-white/10 relative group">
                            <img src={scene.imageUrl} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                               <Play size={32} className="text-white opacity-50" fill="currentColor" />
                            </div>
                         </div>

                         {/* Prompt & Actions */}
                         <div className="flex-1 space-y-4">
                            <div className="flex items-center justify-between">
                               <h4 className="text-purple-400 font-bold text-sm uppercase tracking-widest">المشهد {idx + 1}</h4>
                               <div className="flex gap-2">
                                  <Button 
                                    onClick={() => copyToClipboard(scene.imagePrompt)}
                                    variant="secondary"
                                    className="h-8 px-3 text-[10px] rounded-lg"
                                  >
                                    <Copy size={12} /> نسخ البرومبت
                                  </Button>
                                  <Button 
                                    onClick={() => {
                                      const link = document.createElement('a');
                                      link.href = scene.imageUrl!;
                                      link.download = `scene-${idx+1}-thumb.png`;
                                      link.click();
                                    }}
                                    variant="secondary"
                                    className="h-8 px-3 text-[10px] rounded-lg"
                                  >
                                    <Download size={12} /> حفظ الصورة
                                  </Button>
                               </div>
                            </div>

                            <div className="bg-black/50 p-4 rounded-xl border border-white/5">
                               <p className="font-mono text-[10px] text-zinc-400 leading-relaxed line-clamp-3 md:line-clamp-none">
                                 {scene.imagePrompt}
                               </p>
                            </div>
                            
                            <div className="flex items-center gap-2 text-[10px] text-zinc-600">
                               <Zap size={12} /> نصيحة: استخدم هذا الوصف مع الصورة كـ "Image Prompt" في أدوات الفيديو للحفاظ على الشخصيات.
                            </div>
                         </div>
                      </div>
                    ))
                  )}
                </div>
              </section>
            </div>
          )}
        </main>
      </div>
    </div>
  );

  const renderIdeaGenerator = () => (
    <div className="min-h-screen bg-[#050505] flex items-center justify-center p-4">
      <div className="glass p-10 rounded-[2.5rem] w-full max-w-2xl border border-white/10 relative overflow-hidden">
        <button onClick={() => setStep(AppStep.SETUP)} className="absolute top-8 right-8 text-zinc-500 hover:text-white"><ChevronLeft size={24} /></button>
        <div className="text-center mb-8">
           <h2 className="text-3xl font-black text-white mb-2">مولد القصص الذكي</h2>
           <p className="text-zinc-500">أخبرنا بفكرتك، وسيقوم الذكاء الاصطناعي بكتابة السيناريو</p>
        </div>
        
        <textarea 
          value={ideaText}
          onChange={(e) => setIdeaText(e.target.value)}
          placeholder="مثال: قصة عن محارب يحاول استعادة شرفه في عالم سايبربانك..."
          className="w-full h-48 bg-black/50 border border-zinc-800 p-6 rounded-2xl text-white outline-none focus:border-purple-500 transition-all mb-6 resize-none"
        />

        <div className="grid grid-cols-2 gap-4 mb-8">
           <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">النوع الأدبي</label>
              <select 
                value={config.genre}
                onChange={(e) => setConfig({...config, genre: e.target.value})}
                className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-white text-sm outline-none"
              >
                {GENRES.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
           </div>
           <div className="space-y-2">
              <label className="text-xs font-bold text-zinc-500 uppercase">النمط الفني</label>
              <select 
                value={config.style}
                onChange={(e) => setConfig({...config, style: e.target.value})}
                className="w-full bg-zinc-900 border border-zinc-800 p-3 rounded-xl text-white text-sm outline-none"
              >
                {ART_STYLES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
           </div>
        </div>

        <Button 
          onClick={handleGenerateIdea} 
          isLoading={isGeneratingIdea}
          variant="glow" 
          className="w-full py-4 text-lg rounded-xl"
        >
          توليد القصة <Wand2 size={20} />
        </Button>
      </div>
    </div>
  );

  switch (step) {
    case AppStep.AUTH:
      return renderAuth();
    case AppStep.SETUP:
      return renderLanding();
    case AppStep.IDEA_GENERATOR:
      return renderIdeaGenerator();
    case AppStep.GALLERY:
      return renderGallery();
    case AppStep.STORY_PREVIEW:
    case AppStep.INPUT_STORY:
      return renderWorkspace();
    default:
      return renderLanding();
  }
}

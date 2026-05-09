import React, { useState, useRef, useEffect, Suspense } from "react";
import { Canvas, useLoader } from "@react-three/fiber";
import { OrbitControls, Stage, useTexture, Center, PerspectiveCamera } from "@react-three/drei";
import { OBJLoader } from "three/examples/jsm/loaders/OBJLoader.js";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { 
  Upload, 
  Box, 
  Send, 
  Loader2, 
  Download, 
  CheckCircle2, 
  XCircle,
  AlertCircle,
  Image as ImageIcon,
  Settings,
  Copy,
  Check,
  Trash2,
  Plus,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import axios from "axios";
import imageCompression from "browser-image-compression";
import JSZip from "jszip";

// 3D Model Viewer Component
const Model = ({ url, format }: { url: string; format: string }) => {
  const loader = format.toLowerCase() === "glb" ? GLTFLoader : OBJLoader;
  const result = useLoader(loader, url);
  
  // GLTF returns as a scene, OBJ returns as an object
  const object = format.toLowerCase() === "glb" ? (result as any).scene : result;
  
  return <primitive object={object} scale={1} />;
};

const ModelViewer = ({ url, format }: { url: string; format: string }) => {
  return (
    <div className="w-full h-full bg-neutral-900 rounded-xl overflow-hidden relative border border-neutral-800">
      <Canvas 
        shadows 
        dpr={[1, 1.5]} 
        camera={{ position: [2, 2, 5], fov: 45 }}
        gl={{ antialias: true, preserveDrawingBuffer: true }}
      >
        <PerspectiveCamera makeDefault position={[3, 3, 3]} />
        <Suspense fallback={null}>
          <Stage 
            environment="city" 
            intensity={0.5} 
            adjustCamera 
            shadows={{ type: 'contact', opacity: 0.4, blur: 2 }}
          >
            <Center>
              <Model url={url} format={format} />
            </Center>
          </Stage>
        </Suspense>
        <OrbitControls 
          makeDefault 
          enableDamping={true}
          dampingFactor={0.05}
          autoRotate={false} 
          autoRotateSpeed={0.5} 
        />
      </Canvas>
    </div>
  );
};

export default function App() {
  const [image, setImage] = useState<File | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(() => localStorage.getItem("ARK_LAST_IMAGE_URL"));
  const [externalUrl, setExternalUrl] = useState<string>(() => localStorage.getItem("ARK_LAST_EXTERNAL_URL") || "");
  const [prompt, setPrompt] = useState(() => localStorage.getItem("ARK_LAST_PROMPT") || "");
  const [meshQuality, setMeshQuality] = useState(() => localStorage.getItem("ARK_LAST_QUALITY") || "高");
  const [fileFormat, setFileFormat] = useState(() => localStorage.getItem("ARK_LAST_FORMAT") || "OBJ");
  const [status, setStatus] = useState<"idle" | "uploading" | "submitting" | "running" | "success" | "error">(() => {
    const savedStatus = localStorage.getItem("ARK_CURRENT_STATUS") as any;
    const savedTaskId = localStorage.getItem("ARK_CURRENT_TASK_ID");
    return (savedTaskId && (savedStatus === "running" || savedStatus === "submitting" || savedStatus === "uploading")) ? "running" : "idle";
  });
  const [taskId, setTaskId] = useState<string | null>(() => localStorage.getItem("ARK_CURRENT_TASK_ID"));
  const [resultUrl, setResultUrl] = useState<string | null>(() => localStorage.getItem("ARK_RESULT_URL"));
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [extractStatus, setExtractStatus] = useState<{
    phase: 'idle' | 'downloading' | 'extracting' | 'ready' | 'error';
    progress: number;
    message: string;
  }>({ phase: 'idle', progress: 0, message: "" });
  const [previewCache, setPreviewCache] = useState<Record<string, {url: string, format: string}>>({});
  const [showMonitor, setShowMonitor] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [history, setHistory] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem("ARK_HISTORY");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [logs, setLogs] = useState<{ time: string; msg: string; type: "info" | "success" | "error" | "warning" }[]>([]);
  const [isProcessingImage, setIsProcessingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState(0);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [customApiKey, setCustomApiKey] = useState(() => localStorage.getItem("ARK_API_KEY") || "");
  const [customEndpointId, setCustomEndpointId] = useState(() => localStorage.getItem("ARK_ENDPOINT_ID") || "");
  const [isManualAddOpen, setIsManualAddOpen] = useState(false);
  const [manualTaskIdInput, setManualTaskIdInput] = useState("");

  useEffect(() => {
    localStorage.setItem("ARK_API_KEY", customApiKey);
  }, [customApiKey]);

  useEffect(() => {
    localStorage.setItem("ARK_ENDPOINT_ID", customEndpointId);
  }, [customEndpointId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Avoid toggling when user is typing in the prompt input
      if (document.activeElement?.tagName === 'INPUT' || document.activeElement?.tagName === 'TEXTAREA') {
        return;
      }
      if (e.key.toLowerCase() === "k") {
        setShowMonitor(prev => !prev);
        addLog(`监控面板已${!showMonitor ? '开启' : '关闭'}`, "info");
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showMonitor]);

  // Persistence effects
  useEffect(() => {
    if (taskId) localStorage.setItem("ARK_CURRENT_TASK_ID", taskId);
    else localStorage.removeItem("ARK_CURRENT_TASK_ID");
  }, [taskId]);

  useEffect(() => {
    localStorage.setItem("ARK_CURRENT_STATUS", status);
    if (status === "idle" || status === "error") {
       localStorage.removeItem("ARK_CURRENT_TASK_ID");
    }
  }, [status]);

  useEffect(() => {
    localStorage.setItem("ARK_HISTORY", JSON.stringify(history));
  }, [history]);

  useEffect(() => {
    if (resultUrl) localStorage.setItem("ARK_RESULT_URL", resultUrl);
    else localStorage.removeItem("ARK_RESULT_URL");
  }, [resultUrl]);

  useEffect(() => {
    localStorage.setItem("ARK_LAST_QUALITY", meshQuality);
    localStorage.setItem("ARK_LAST_FORMAT", fileFormat);
    localStorage.setItem("ARK_LAST_PROMPT", prompt);
    localStorage.setItem("ARK_LAST_EXTERNAL_URL", externalUrl);
    if (imageUrl && !imageUrl.startsWith("blob:")) {
      localStorage.setItem("ARK_LAST_IMAGE_URL", imageUrl);
    }
  }, [meshQuality, fileFormat, prompt, imageUrl, externalUrl]);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const addLog = (msg: string, type: "info" | "success" | "error" | "warning" = "info") => {
    const time = new Date().toLocaleTimeString('en-GB', { hour12: false });
    setLogs(prev => [...prev, { time, msg, type }].slice(-6)); // Keep last 6 logs
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      let file = e.target.files[0];
      
      setIsProcessingImage(true);
      setImageProgress(0);

      // Strict constraint for Volcengine API: max 4096px, we use 2048px for better compatibility and speed
      const options = {
        maxSizeMB: 9,
        maxWidthOrHeight: 2048,
        useWebWorker: true,
        onProgress: (p: number) => setImageProgress(p),
      };

      try {
        addLog(`正在处理图像: ${file.name}...`, "info");
        // Always run through compression to ensure dimensions are within bounds
        file = await imageCompression(file, options);
        addLog(`处理完成: ${(file.size / 1024 / 1024).toFixed(2)}MB`, "success");
        
        setImage(file);
        setImageUrl(URL.createObjectURL(file));
        setExternalUrl("");
      } catch (error) {
        console.error("Image processing error:", error);
        addLog("图像处理失败，将尝试直接使用原图", "warning");
        setImage(file);
        setImageUrl(URL.createObjectURL(file));
      } finally {
        setIsProcessingImage(false);
        setImageProgress(0);
      }
    }
  };

  const getBase64 = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.readAsDataURL(file);
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = error => reject(error);
    });
  };

  const handleSubmit = async () => {
    try {
      let finalImageUrl = externalUrl || "";
      
      if (image) {
        setStatus("uploading");
        addLog(`正在准备图像数据...`);
        finalImageUrl = await getBase64(image);
        addLog(`图像已转换为 Base64`, "success");
      }

      if (!finalImageUrl) {
        setErrorMessage("请提供图片 URL 或上传文件");
        setStatus("error");
        addLog("未提供源图像", "error");
        return;
      }

      setStatus("submitting");
      setResultUrl(null);
      setPreviewBlobUrl(null);
      addLog(`正在创建生成任务 (前端直连)...`);

      const apiKey = customApiKey || import.meta.env.VITE_ARK_API_KEY;
      const endpointId = customEndpointId || import.meta.env.VITE_ARK_ENDPOINT_ID || "doubao-seed3d-2-0-260328";

      if (!apiKey) {
        throw new Error("未配置 API Key (VITE_ARK_API_KEY)");
      }

      const res = await axios.post("https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks", {
        model: endpointId,
        content: [
          {
            type: "text",
            text: ` --subdivisionlevel ${meshQuality === "高" ? "high" : meshQuality === "标准" ? "medium" : "low"} --fileformat ${fileFormat.toLowerCase()} ${prompt || ""}`.trim(),
          },
          {
            type: "image_url",
            image_url: {
              url: finalImageUrl,
            },
          },
        ],
      }, { 
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json"
        },
        timeout: 45000 
      });

      if (res.data.id) {
        const newTaskId = res.data.id;
        setTaskId(newTaskId);
        setStatus("running");
        addLog(`任务创建成功! ID: ${newTaskId}`, "success");
        
        // Add to history immediately
        const historyItem = {
          id: newTaskId,
          name: image ? image.name : (externalUrl?.split('/').pop() || '未命名'),
          sourceImage: finalImageUrl,
          thumbnail: null,
          type: fileFormat,
          quality: meshQuality,
          date: new Date().toLocaleTimeString(),
          status: '处理中'
        };
        setHistory(prev => [historyItem, ...prev]);
      } else {
        throw new Error("接口未返回任务ID");
      }
    } catch (err: any) {
      console.error("Submit error:", err);
      const msg = err.response?.data?.error?.message || err.message || "任务提交失败";
      setErrorMessage(msg);
      setStatus("error");
      addLog(`创建失败: ${msg}`, "error");
    }
  };

  // Polling for task status
  useEffect(() => {
    let interval: any;
    if (status === "running" && taskId) {
      interval = setInterval(async () => {
        try {
          const apiKey = customApiKey || import.meta.env.VITE_ARK_API_KEY;
          const res = await axios.get(`https://ark.cn-beijing.volces.com/api/v3/contents/generations/tasks/${taskId}`, { 
            headers: {
              "Authorization": `Bearer ${apiKey}`
            } 
          });
          const taskData = res.data;

          if (taskData.status === "success" || taskData.status === "succeeded") {
            // 尝试从多个可能的字段中提取 URL
            const url = taskData.content?.file_url ||
                        taskData.result_url || 
                        taskData.output_url || 
                        (taskData.result && taskData.result.url) ||
                        (taskData.result && Array.isArray(taskData.result) && taskData.result[0]?.url) ||
                        (taskData.content && Array.isArray(taskData.content) && taskData.content[0]?.url) ||
                        (taskData.output && taskData.output.model_url);

            if (!url) {
              addLog("任务成功但未找到结果链接，请检查控制台", "warning");
              console.log("Full task data for debugging:", taskData);
            }
            setResultUrl(url);
            setStatus("success");
            addLog(`渲染完成`, "success");
            setHistory(prev => prev.map(item => 
              item.id === taskId 
                ? { ...item, status: '成功', url } 
                : item
            ));
            clearInterval(interval);
          } else if (taskData.status === "failed") {
            const errorMsg = taskData.error_message || (taskData.error && taskData.error.message) || "任务在服务器端失败";
            setErrorMessage(errorMsg);
            setStatus("error");
            addLog(`任务失败: ${errorMsg}`, "error");
            setHistory(prev => prev.map(item => 
              item.id === taskId 
                ? { ...item, status: '失败' } 
                : item
            ));
            clearInterval(interval);
          } else {
            const progress = taskData.progress !== undefined ? taskData.progress : 0;
            addLog(`正在生成中... (${progress}%)`, "info");
          }
        } catch (err: any) {
          console.error("Polling error:", err);
          const status = err.response?.status;
          if (status === 401 || status === 403 || status === 404) {
            setErrorMessage("查询状态请求失败");
            setStatus("error");
            clearInterval(interval);
          }
        }
      }, 5000);
    }
    return () => clearInterval(interval);
  }, [status, taskId, customApiKey]);


  const [copiedId, setCopiedId] = useState<string | null>(null);

  const handleCopyId = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setCopiedId(id);
    addLog(`Task ID 已拷贝: ${id}`, "info");
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleDownload = (e: React.MouseEvent | null, url: string, name: string) => {
    if (e) e.stopPropagation();
    
    // Direct download in pure browser
    const link = document.createElement("a");
    link.href = url;
    link.download = name || "model";
    // For many cross-origin downloads, we need target="_blank" and rel="noopener"
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    addLog(`触发浏览器下载流程...`, "info");
  };

  const [modelError, setModelError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    
    const processResultUrl = async () => {
      if (!resultUrl) {
        setPreviewBlobUrl(null);
        return;
      }

      // Check cache first
      if (previewCache[resultUrl]) {
        setPreviewBlobUrl(previewCache[resultUrl].url);
        setFileFormat(previewCache[resultUrl].format);
        setExtractStatus({ phase: 'ready', progress: 100, message: "来自缓存" });
        return;
      }

      setModelError(null);
      
      const isZip = resultUrl.toLowerCase().includes(".zip");
      
      if (isZip) {
        setExtractStatus({ phase: 'downloading', progress: 0, message: "正在获取资产数据..." });
        addLog(`检测到 ZIP 容器，正在尝试并行下载与提取...`, "info");
        try {
          // Direct fetch - many generation APIs now support CORS for their result fields
          // Use fetch for better stream control if needed, but axios with progress is fine
          const response = await axios.get(resultUrl, { 
            responseType: 'arraybuffer',
            headers: {
               // Some browsers need this for non-cached direct access
               'Accept': 'application/zip, application/octet-stream'
            },
            onDownloadProgress: (progressEvent) => {
              if (progressEvent.total) {
                const percent = (progressEvent.loaded / progressEvent.total) * 100;
                setExtractStatus(prev => ({ ...prev, progress: percent * 0.8 })); 
              }
            }
          });
          
          if (!active) return;
          setExtractStatus({ phase: 'extracting', progress: 85, message: "正在并行解压 3D 资产..." });

          const zip = await JSZip.loadAsync(response.data);
          
          // Find 3D files
          let modelFile: JSZip.JSZipObject | undefined;
          let detectedFormat = "OBJ";

          const files = Object.keys(zip.files);
          // GLB is preferred for performance
          const glbFile = files.find(f => f.toLowerCase().endsWith(".glb"));
          if (glbFile) {
            modelFile = zip.files[glbFile];
            detectedFormat = "GLB";
          } else {
            const objFile = files.find(f => f.toLowerCase().endsWith(".obj"));
            if (objFile) {
              modelFile = zip.files[objFile];
              detectedFormat = "OBJ";
            }
          }

          if (modelFile) {
            setExtractStatus({ phase: 'extracting', progress: 95, message: "准备实时渲染..." });
            const blob = await modelFile.async("blob");
            if (!active) return;
            
            const blobUrl = URL.createObjectURL(blob);
            setPreviewBlobUrl(blobUrl);
            setFileFormat(detectedFormat);
            setPreviewCache(prev => ({ ...prev, [resultUrl]: { url: blobUrl, format: detectedFormat } }));
            setExtractStatus({ phase: 'ready', progress: 100, message: "解析完成" });
            addLog(`成功从 ZIP 中提取预览模型 (${detectedFormat})`, "success");
          } else {
            setModelError("该 ZIP 包中未找到可在线预览的 GLB 或 OBJ 格式。");
            setExtractStatus({ phase: 'error', progress: 0, message: "缺失预览资产" });
          }
        } catch (err: any) {
          console.error("Fetch/Zip error:", err);
          const isCors = err.message?.includes('Network Error') || err.code === 'ERR_NETWORK';
          setModelError(isCors 
            ? "资源获取受限 (CORS)。浏览器无法直接读取此远程文件，请点击下方按钮手动下载并在本地查看。" 
            : "资源解析失败，请尝试重新生成或下载。");
          setExtractStatus({ phase: 'error', progress: 0, message: "获取失败" });
          addLog(isCors ? "受 CORS 限制，无法前端直读" : "解析错误", "error");
        } finally {
          if (active) {
            setExtractStatus(prev => prev.phase === 'ready' ? prev : { phase: 'idle', progress: 0, message: "" });
          }
        }
      } else {
        // Normal model file - try direct fetch
        setPreviewBlobUrl(resultUrl);
        setPreviewCache(prev => ({ ...prev, [resultUrl]: { url: resultUrl, format: fileFormat } }));
        setExtractStatus({ phase: 'ready', progress: 100, message: "直连预览中" });
      }
    };

    processResultUrl();

    return () => {
      active = false;
      // We don't revoke here because we are caching. 
      // We should probably limit the cache size if memory is an issue.
    };
  }, [resultUrl, previewCache]);

  const handleSelectHistoryItem = (item: any) => {
    if (!item.id) return;
    
    addLog(`加载任务: ${item.id}`, "info");
    setTaskId(item.id);
    setResultUrl(item.url || null);
    
    if (item.status === '处理中') {
      setStatus("running");
    } else if (item.status === '成功') {
      setStatus("success");
    } else {
      // Re-poll failed or other states
      setStatus("running");
    }
  };

  const handleManualAdd = () => {
    if (!manualTaskIdInput.trim()) return;
    
    const trimmedId = manualTaskIdInput.trim();
    
    // Check if already in history
    if (history.find(h => h.id === trimmedId)) {
      addLog(`该任务 ID 已在记录中`, "warning");
      const existingItem = history.find(h => h.id === trimmedId);
      handleSelectHistoryItem(existingItem);
      setManualTaskIdInput("");
      setIsManualAddOpen(false);
      return;
    }

    const newItem = {
      id: trimmedId,
      name: "手动添加",
      sourceImage: null, // 手动添加的任务可能没有源图
      thumbnail: null,
      type: "OBJ", 
      quality: "未知",
      date: new Date().toLocaleTimeString(),
      status: '处理中'
    };

    setHistory(prev => [newItem, ...prev]);
    setTaskId(trimmedId);
    setStatus("running");
    setResultUrl(null);
    setPreviewBlobUrl(null);
    setManualTaskIdInput("");
    setIsManualAddOpen(false);
    addLog(`手动添加任务: ${trimmedId}`, "success");
  };

  const handleDeleteHistoryItem = (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    setHistory(prev => {
      const newHistory = prev.filter(item => item.id !== id);
      localStorage.setItem("ARK_HISTORY", JSON.stringify(newHistory));
      return newHistory;
    });
    if (taskId === id) {
      setTaskId(null);
      setResultUrl(null);
      setPreviewBlobUrl(null);
      setStatus("idle");
    }
  };

  return (
    <div className="h-screen w-full bg-[#020617] text-slate-200 font-sans flex flex-col overflow-hidden select-none">
      {/* Top Navigation */}
      <header className="h-16 border-b border-slate-800 flex items-center justify-between px-6 bg-slate-900/50 backdrop-blur-md shrink-0">
        <div className="flex items-center space-x-3">
          <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center text-white shadow-lg shadow-blue-600/20">
            <Box className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold tracking-tight text-white">3D 模型生成器</h1>
        </div>
        <div className="flex items-center space-x-6">
          <div className="flex space-x-4 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            <button onClick={() => setIsSettingsOpen(true)} className="text-blue-400 hover:text-blue-300 transition-colors uppercase cursor-pointer">设置</button>
          </div>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Controls Panel */}
        <aside className="w-80 border-r border-slate-800 bg-slate-900/30 p-6 flex flex-col space-y-8 overflow-y-auto invisible-scrollbar">
          <div className="space-y-4">
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <span className="text-xs text-slate-400 mb-2 block">模型精度</span>
                  <select 
                    value={meshQuality}
                    onChange={(e) => setMeshQuality(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 px-2 py-1.5 rounded text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option>高</option>
                    <option>标准</option>
                    <option>低</option>
                  </select>
                </div>
                <div>
                  <span className="text-xs text-slate-400 mb-2 block">文件格式</span>
                  <select 
                    value={fileFormat}
                    onChange={(e) => setFileFormat(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 px-2 py-1.5 rounded text-xs text-white focus:ring-1 focus:ring-blue-500 outline-none transition-all appearance-none cursor-pointer"
                  >
                    <option>OBJ</option>
                    <option>GLB</option>
                  </select>
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="text-[10px] font-bold uppercase tracking-widest text-slate-500">源图像</label>
            <div 
              onClick={() => !isProcessingImage && fileInputRef.current?.click()}
              className={`
                group relative aspect-square w-full rounded-xl border-2 border-dashed flex flex-col items-center justify-center cursor-pointer transition-all overflow-hidden
                ${isProcessingImage ? 'border-blue-500/30 bg-blue-500/5 cursor-wait' : imageUrl ? 'border-blue-500/50 bg-blue-500/5' : 'border-slate-700 hover:border-blue-500 bg-slate-800/30'}
              `}
            >
              {isProcessingImage ? (
                <div className="flex flex-col items-center p-4 space-y-3">
                  <div className="flex items-center justify-center">
                    <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                  </div>
                  <span className="text-[10px] font-bold text-white uppercase tracking-widest text-center">正在优化图像...</span>
                </div>
              ) : imageUrl ? (
                <>
                  <img src={imageUrl} className="absolute inset-0 w-full h-full object-cover opacity-60" alt="Input" />
                  <div className="relative z-10 flex flex-col items-center p-3 bg-slate-900/80 rounded-lg border border-slate-700 opacity-0 group-hover:opacity-100 transition-opacity">
                    <ImageIcon className="w-5 h-5 text-blue-400 mb-1" />
                    <span className="text-[10px] font-medium text-slate-300 uppercase tracking-tight">更换图片</span>
                  </div>
                </>
              ) : (
                <div className="flex flex-col items-center p-4">
                  <Upload className="w-8 h-8 text-slate-600 group-hover:text-blue-400 mb-2 transition-colors" />
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">点击或拖拽上传</span>
                </div>
              )}
              <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept="image/*" disabled={isProcessingImage} />
            </div>
          </div>

          <div className="mt-auto pt-4">
            <button 
              onClick={handleSubmit}
              disabled={status !== "idle" && status !== "error" && status !== "success"}
              className={`
                w-full py-3 rounded-xl font-bold text-sm transition-all shadow-lg active:scale-95 flex items-center justify-center gap-2
                ${status === 'idle' || status === 'error' || status === 'success' 
                  ? 'bg-blue-600 hover:bg-blue-500 text-white shadow-blue-600/20' 
                  : 'bg-slate-800 text-slate-500 cursor-not-allowed'}
              `}
            >
              {status === 'running' ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : <Send className="w-4 h-4" />}
              {status === 'running' ? '生成中...' : '开始生成 3D 模型'}
            </button>
          </div>
        </aside>

        {/* Main Viewport Area */}
        <main className="flex-1 flex flex-col relative bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-slate-900 via-slate-950 to-slate-950">
          {/* Active Preview */}
          <div className="flex-1 flex flex-col items-center justify-center relative">
            {/* Grid Background */}
            <div className="absolute inset-0 opacity-10 bg-[linear-gradient(rgba(255,255,255,0.05)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.05)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none"></div>
            
            <AnimatePresence mode="wait">
              {status === "success" && resultUrl ? (
                <motion.div 
                  key="result"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="w-full h-full relative flex items-center justify-center p-8"
                >
                  {extractStatus.phase === 'downloading' || extractStatus.phase === 'extracting' ? (
                    <motion.div 
                      key="extracting"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-center space-y-6 w-full max-w-md mx-auto"
                    >
                      <div className="relative w-20 h-20 mx-auto mb-6">
                        <Loader2 className="w-full h-full text-blue-500 animate-spin absolute inset-0 opacity-20" />
                        <div className="absolute inset-0 flex items-center justify-center">
                          <span className="text-[10px] font-mono font-bold text-blue-400">{Math.round(extractStatus.progress)}%</span>
                        </div>
                        <motion.div 
                          className="absolute inset-0 border-2 border-blue-500 rounded-full border-t-transparent"
                          animate={{ rotate: 360 }}
                          transition={{ duration: 1, repeat: Infinity, ease: "linear" }}
                        />
                      </div>

                      <div className="space-y-2">
                        <h3 className="text-sm font-black text-white uppercase tracking-[0.2em]">{extractStatus.message}</h3>
                        <div className="w-full h-1 bg-slate-800 rounded-full overflow-hidden">
                          <motion.div 
                            className="h-full bg-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.5)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${extractStatus.progress}%` }}
                          />
                        </div>
                        <div className="flex justify-between items-center px-1">
                          <span className="text-[9px] font-mono text-slate-500">PHASE: {extractStatus.phase.toUpperCase()}</span>
                          <span className="text-[9px] font-mono text-slate-500">TASK: {taskId?.slice(0, 12)}</span>
                        </div>
                      </div>
                    </motion.div>
                  ) : modelError ? (
                    <motion.div 
                      key="error-box"
                      initial={{ scale: 0.9, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      className="text-center space-y-4 max-w-sm bg-slate-900/50 backdrop-blur-md p-8 rounded-3xl border border-slate-800"
                    >
                      <div className="w-16 h-16 bg-blue-500/10 rounded-full flex items-center justify-center mx-auto mb-4">
                        <Download className="w-8 h-8 text-blue-500" />
                      </div>
                      <h3 className="text-lg font-bold text-white">模型已就绪</h3>
                      <p className="text-sm text-slate-400">{modelError}</p>
                      <button 
                        onClick={() => handleDownload(null, resultUrl, `model_${taskId}.zip`)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-6 py-2 rounded-xl text-xs font-bold transition-all shadow-lg shadow-blue-600/20 active:scale-95 w-full"
                      >
                         立即下载模型包 (ZIP)
                      </button>
                      <button 
                        onClick={() => setStatus("idle")}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-400 px-6 py-2 rounded-xl text-xs font-bold transition-all w-full"
                      >
                         返回
                      </button>
                    </motion.div>
                  ) : previewBlobUrl ? (
                    <>
                      <ModelViewer 
                        url={previewBlobUrl} 
                        format={fileFormat} 
                      />
                      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex space-x-3 pointer-events-auto">
                        <button 
                          onClick={() => {
                            setStatus("idle");
                            setResultUrl(null);
                            setTaskId(null);
                          }}
                          className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-700 hover:text-red-400 transition-colors shadow-xl group"
                          title="关闭预览"
                        >
                          <XCircle className="w-5 h-5" />
                        </button>
                        <button 
                          onClick={() => handleDownload(null, resultUrl, `model_${taskId}.${fileFormat.toLowerCase()}`)}
                          className="p-2.5 bg-slate-900/90 rounded-xl border border-slate-700 hover:text-blue-400 transition-colors shadow-xl"
                        >
                          <Download className="w-5 h-5" />
                        </button>
                        <div className="bg-slate-900/90 px-4 py-2 rounded-xl border border-slate-700 text-[10px] font-mono text-blue-400 flex items-center">
                          预览 ID: {taskId?.slice(0, 8)}
                        </div>
                      </div>
                    </>
                  ) : (
                    <div className="text-slate-500 font-mono text-xs uppercase tracking-widest flex flex-col items-center gap-4">
                      <Loader2 className="w-8 h-8 animate-spin text-slate-700" />
                      <span>正在准备预览内容...</span>
                    </div>
                  )}
                </motion.div>
              ) : (status === "running" || status === "submitting" || status === "uploading") ? (
                <motion.div 
                  key="running"
                  className="relative flex flex-col items-center"
                >
                   <div className="w-72 h-72 border-2 border-blue-500/20 rounded-full flex items-center justify-center">
                      <div className="w-60 h-60 border border-blue-400/10 rounded-full animate-ping"></div>
                   </div>
                   <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-center pointer-events-none">
                     <Loader2 className="w-16 h-16 text-blue-500 mx-auto mb-4 animate-spin" />
                     <div className="bg-slate-900/80 px-4 py-1.5 rounded-full border border-slate-700 text-xs font-mono text-blue-400 animate-pulse uppercase">
                        {status === 'uploading' ? '正在上传...' : '正在处理...'}
                     </div>
                   </div>
                </motion.div>
              ) : status === "error" ? (
                <motion.div className="text-center p-8 space-y-4 max-w-sm">
                  <XCircle className="w-16 h-16 text-red-500/80 mx-auto" />
                  <p className="text-sm text-slate-400">{errorMessage}</p>
                  <button onClick={() => setStatus('idle')} className="text-xs font-bold text-blue-400 uppercase tracking-widest hover:text-blue-300">重试</button>
                </motion.div>
              ) : (
                <motion.div className="text-center opacity-30 select-none">
                  <Box className="w-24 h-24 text-slate-600 mx-auto mb-4" />
                  <p className="text-sm font-bold uppercase tracking-[0.2em] text-slate-500">等待任务输入</p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Task Status / Console */}
          <AnimatePresence>
            {showMonitor && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 176, opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="bg-slate-950/80 border-t border-slate-800 p-4 font-mono overflow-hidden shrink-0"
              >
                <div className="flex items-center justify-between mb-3 border-b border-white/5 pb-2">
                  <span className="text-[10px] text-slate-500 uppercase font-black tracking-widest">系统监控 (按 "K" 隐藏)</span>
                  <span className="flex items-center text-[10px] text-blue-500/80 font-bold">
                    <span className="w-2 h-2 rounded-full bg-blue-500 mr-2 animate-pulse"></span> 
                    ARK_SEED3D_2.0_准备就绪
                  </span>
                </div>
                <div className="text-[11px] space-y-1.5 overflow-y-auto max-h-24 custom-scrollbar">
                  {logs.length === 0 && <p className="text-slate-600 italic">尚未检测到系统活动...</p>}
                  {logs.map((log, i) => (
                    <p key={i} className="flex">
                      <span className="text-blue-500/50 w-20 leading-none shrink-0">[{log.time}]</span>
                      <span className={`
                        ${log.type === 'error' ? 'text-red-400' : log.type === 'success' ? 'text-green-400' : log.type === 'warning' ? 'text-yellow-400' : 'text-slate-300'}
                        leading-none
                      `}>
                        {log.msg}
                      </span>
                    </p>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </main>

        {/* Right History Panel */}
        <aside className="w-64 border-l border-slate-800 bg-slate-900/30 flex flex-col shrink-0 overflow-hidden">
          <div className="p-4 border-b border-slate-800 flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 leading-none">历史记录</span>
            <button 
              onClick={() => setIsManualAddOpen(!isManualAddOpen)}
              className={`p-1.5 rounded-md transition-colors ${isManualAddOpen ? 'bg-blue-600/20 text-blue-400' : 'hover:bg-white/5 text-slate-500'}`}
              title="手动添加任务 ID"
            >
              <Plus className={`w-3.5 h-3.5 transition-transform ${isManualAddOpen ? 'rotate-45' : ''}`} />
            </button>
          </div>
          
          <AnimatePresence>
            {isManualAddOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: "auto", opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="overflow-hidden border-b border-slate-800/50"
              >
                <div className="p-3 space-y-2">
                  <input 
                    type="text" 
                    placeholder="输入任务 ID..."
                    value={manualTaskIdInput}
                    onChange={(e) => setManualTaskIdInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleManualAdd()}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg px-3 py-1.5 text-xs text-white focus:border-blue-500/50 outline-none placeholder:text-slate-700 font-mono transition-all"
                  />
                  <div className="flex gap-2">
                    <button 
                      onClick={handleManualAdd}
                      disabled={!manualTaskIdInput.trim()}
                      className="flex-1 bg-blue-600/20 hover:bg-blue-600/30 text-blue-400 text-[10px] font-bold py-1.5 rounded-md transition-all active:scale-95 disabled:opacity-50"
                    >
                      确认添加
                    </button>
                    <button 
                      onClick={() => {
                        setIsManualAddOpen(false);
                        setManualTaskIdInput("");
                      }}
                      className="px-2 border border-slate-800 text-slate-500 text-[10px] py-1.5 rounded-md hover:bg-white/5 transition-all"
                    >
                      取消
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div className="flex-1 overflow-y-auto space-y-2 p-2 custom-scrollbar">
            {history.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full opacity-20 p-4 text-center">
                <Settings className="w-8 h-8 mb-2" />
                <p className="text-[10px] uppercase font-bold tracking-tighter">生成的模型将显示在这里</p>
              </div>
            )}
            {history.map((item, i) => (
              <div 
                key={i} 
                onClick={() => handleSelectHistoryItem(item)}
                className={`
                  p-3 rounded-lg border transition-all cursor-pointer group
                  ${taskId === item.id 
                    ? 'bg-blue-500/10 border-blue-500/50 ring-1 ring-blue-500/20' 
                    : item.status === '成功' 
                      ? 'bg-blue-500/5 border-blue-500/20 hover:border-blue-500/40' 
                      : 'bg-slate-800/10 border-slate-800 hover:border-slate-700'
                  }
                `}
              >
                <div className="flex justify-between items-start mb-2 gap-3">
                  <div className="flex items-center gap-2 overflow-hidden">
                    {(item.thumbnail || item.sourceImage) && (
                      <div className="w-10 h-10 rounded-lg bg-slate-800 shrink-0 overflow-hidden border border-slate-700 flex items-center justify-center">
                        <img 
                          src={item.thumbnail || item.sourceImage} 
                          className="w-full h-full object-cover" 
                          alt="" 
                          referrerPolicy="no-referrer"
                        />
                      </div>
                    )}
                    <div className="flex flex-col min-w-0">
                      <span className={`text-[11px] font-bold truncate ${item.status === '成功' ? 'text-blue-400' : 'text-slate-400'}`}>
                        {item.name}
                      </span>
                      <span className="text-[9px] text-slate-600 truncate">{item.date}</span>
                    </div>
                  </div>
                  <button 
                    onClick={(e) => handleDeleteHistoryItem(e, item.id)}
                    className="p-1 px-1.5 opacity-0 group-hover:opacity-100 bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-md transition-all active:scale-95"
                    title="删除记录"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className={`
                      px-1.5 py-0.5 rounded text-[8px] uppercase font-black
                      ${item.status === '成功' ? 'bg-green-500/10 text-green-400' : item.status === '处理中' ? 'bg-blue-500/10 text-blue-400 animate-pulse' : 'bg-red-500/10 text-red-400'}
                    `}>
                      {item.status}
                    </span>
                    {item.id && (
                      <button 
                        onClick={(e) => handleCopyId(e, item.id)}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-300 px-1.5 py-0.5 rounded-sm transition-colors flex items-center gap-1 text-[9px]"
                        title="复制任务ID"
                      >
                        {copiedId === item.id ? (
                          <>
                            <Check className="w-2.5 h-2.5 text-green-400" />
                            <span className="text-green-400">已复制</span>
                          </>
                        ) : (
                          <>
                            <Copy className="w-2.5 h-2.5" />
                            <span>ID</span>
                          </>
                        )}
                      </button>
                    )}
                    {item.status === '成功' && item.url && (
                      <button 
                        onClick={(e) => handleDownload(e, item.url, `${item.name}.${item.type.toLowerCase()}`)}
                        className="bg-blue-600 hover:bg-blue-500 text-white px-2 py-0.5 rounded-sm transition-all flex items-center gap-1 text-[9px] shadow-lg shadow-blue-500/20"
                        title="下载 3D 模型"
                      >
                        <Download className="w-2.5 h-2.5" />
                        <span className="font-bold">下载</span>
                      </button>
                    )}
                  </div>
                  <span className="text-[9px] text-slate-500 italic font-medium">{item.type} / {item.quality}</span>
                </div>
                {item.status === '成功' && (
                   <div className="mt-2 text-[10px] text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity font-bold uppercase flex items-center gap-1">
                      加载资产 <Send className="w-2 h-2" />
                   </div>
                )}
              </div>
            ))}
          </div>
          
          <div className="p-4 mt-auto border-t border-slate-800 flex items-center justify-center">
            <button 
              onClick={() => setHistory([])}
              className="text-[9px] font-black text-slate-500 hover:text-slate-300 uppercase tracking-widest transition-colors"
            >
              清空记录
            </button>
          </div>
        </aside>
      </div>

      {/* Settings Modal */}
      <AnimatePresence>
        {isSettingsOpen && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-[100] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
            onClick={() => setIsSettingsOpen(false)}
          >
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-slate-900 border border-slate-800 rounded-3xl p-8 w-full max-w-md shadow-2xl space-y-6"
              onClick={e => e.stopPropagation()}
            >
              <div className="space-y-2">
                <h3 className="text-2xl font-bold text-white flex items-center gap-3">
                  <Settings className="w-7 h-7 text-blue-500" />
                  设置
                </h3>
                <p className="text-sm text-slate-400">配置您的火山引擎 Ark API 密钥。</p>
              </div>

              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ARK_API_KEY</label>
                  <input 
                    type="password"
                    placeholder="输入您的 API Key..."
                    value={customApiKey}
                    onChange={(e) => setCustomApiKey(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:border-blue-500 outline-none transition-all"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-500">ENDPOINT_ID / 模型 ID (可选)</label>
                  <input 
                    type="text"
                    placeholder="默认: doubao-seed3d-2-0-260328"
                    value={customEndpointId}
                    onChange={(e) => setCustomEndpointId(e.target.value)}
                    className="w-full bg-slate-800 border border-slate-700 rounded-xl px-4 py-3 text-sm text-slate-200 focus:border-blue-500 outline-none transition-all"
                  />
                  <p className="text-[10px] text-slate-500 italic">如果您创建了私有部署端点，请在此输入端点 ID。</p>
                </div>
                <p className="text-[10px] text-slate-500 italic pt-2 border-t border-slate-800">设置将保存在本地浏览器缓存中。</p>
              </div>

              <div className="pt-4">
                <button 
                  onClick={() => setIsSettingsOpen(false)}
                  className="w-full py-4 bg-blue-600 hover:bg-blue-500 text-white rounded-2xl font-bold transition-all shadow-xl shadow-blue-600/20 active:scale-[0.98]"
                >
                  保存并关闭
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}


using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;
using Microsoft.Web.WebView2.Core;
using Microsoft.Web.WebView2.WinForms;

static class Program {
    [DllImport("user32.dll",CharSet=CharSet.Unicode)] static extern IntPtr FindWindow(string name,string title);
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr window);
    [DllImport("user32.dll")] static extern bool ShowWindow(IntPtr window,int command);
    [STAThread] static void Main(string[] args) {
        Application.EnableVisualStyles(); Application.SetCompatibleTextRenderingDefault(false);
        var root = AppDomain.CurrentDomain.BaseDirectory;
        bool first;
        using (var mutex = new Mutex(true, "Local\\FCUT-Desktop", out first)) {
            if (!first) { var window=FindWindow(null,"FCUT · 视频剪辑"); if(window!=IntPtr.Zero){ShowWindow(window,9);SetForegroundWindow(window);} return; }
            try { Application.Run(new Editor(root, Array.IndexOf(args, "--smoke-test") >= 0)); }
            catch (Exception e) { MessageBox.Show(e.Message, "FCUT 启动失败", MessageBoxButtons.OK, MessageBoxIcon.Error); Environment.ExitCode = 1; }
        }
    }
}

sealed class Editor : Form {
    readonly string root, profile, data; readonly bool smoke;
    readonly WebView2 web = new WebView2();
    readonly Label status = new Label { Text = "正在启动 FCUT…", Dock = DockStyle.Fill, TextAlign = ContentAlignment.MiddleCenter, ForeColor = Color.White };
    Process backend; ProcessJob job; string origin; bool ready, closing, allowClose; string backendError = "";
    readonly TaskCompletionSource<string> address = new TaskCompletionSource<string>();
    public Editor(string root, bool smoke) {
        this.root=root; this.smoke=smoke;
        profile=Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),"FCUT");
        data=Environment.GetEnvironmentVariable("FCUT_DATA_DIR") ?? Path.Combine(profile,"data");
        Text="FCUT · 视频剪辑"; Width=1440; Height=950; MinimumSize=new Size(1100,760); StartPosition=FormStartPosition.CenterScreen;
        BackColor=Color.FromArgb(24,26,29); Icon=Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        web.Dock=DockStyle.Fill; web.Visible=false; Controls.Add(web); Controls.Add(status);
        Shown += async delegate { await Start(); };
        FormClosing += OnClosing;
        FormClosed += delegate { Cleanup(); };
    }
    async Task Start() {
        try {
            CoreWebView2Environment.GetAvailableBrowserVersionString();
            if (!File.Exists(Path.Combine(root,"runtime","node.exe")) || !File.Exists(Path.Combine(root,"server.mjs"))) throw new Exception("运行文件不完整。请解压整个 FCUT 文件夹，再运行 FCUT.exe。");
            Directory.CreateDirectory(profile); Directory.CreateDirectory(data);
            job=new ProcessJob();
            var info=new ProcessStartInfo(Path.Combine(root,"runtime","node.exe"),"\""+Path.Combine(root,"server.mjs")+"\"") {
                WorkingDirectory=root, UseShellExecute=false, CreateNoWindow=true, RedirectStandardInput=true, RedirectStandardOutput=true, RedirectStandardError=true
            };
            info.EnvironmentVariables["PORT"]="0"; info.EnvironmentVariables["FCUT_DESKTOP"]="1"; info.EnvironmentVariables["FCUT_DATA_DIR"]=data;
            backend=new Process { StartInfo=info, EnableRaisingEvents=true };
            backend.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) {
                if(e.Data!=null && e.Data.StartsWith("FCUT ready http://127.0.0.1:")) address.TrySetResult(e.Data.Substring("FCUT ready ".Length));
            };
            backend.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { if(e.Data!=null) backendError=e.Data; };
            backend.Exited += delegate {
                address.TrySetException(new Exception("本地服务已退出："+backendError));
                if(ready && !closing && !allowClose && !IsDisposed) {
                    try { BeginInvoke((Action)(()=>{status.Text="本地服务已退出。请关闭并重新打开 FCUT。";status.BringToFront();status.Visible=true;})); } catch(InvalidOperationException) { }
                }
            };
            backend.Start(); job.Add(backend); backend.BeginOutputReadLine(); backend.BeginErrorReadLine();
            if(await Task.WhenAny(address.Task,Task.Delay(20000))!=address.Task) throw new Exception("本地服务启动超时。"+backendError);
            origin=await address.Task;
            var env=await CoreWebView2Environment.CreateAsync(null,Path.Combine(profile,smoke?"test-webview":"webview"));
            await web.EnsureCoreWebView2Async(env);
            web.CoreWebView2.Settings.AreDevToolsEnabled=false;
            web.CoreWebView2.Settings.IsStatusBarEnabled=false;
            web.CoreWebView2.Settings.AreDefaultContextMenusEnabled=false;
            web.CoreWebView2.PermissionRequested += delegate(object s, CoreWebView2PermissionRequestedEventArgs e) { e.State=CoreWebView2PermissionState.Deny; };
            web.CoreWebView2.NavigationStarting += delegate(object s, CoreWebView2NavigationStartingEventArgs e) {
                Uri u; if(!Uri.TryCreate(e.Uri,UriKind.Absolute,out u) || u.GetLeftPart(UriPartial.Authority)!=origin) e.Cancel=true;
            };
            web.CoreWebView2.NewWindowRequested += delegate(object s,CoreWebView2NewWindowRequestedEventArgs e) {
                e.Handled=true; Uri u;
                if(Uri.TryCreate(e.Uri,UriKind.Absolute,out u) && (u.Scheme=="https" || u.Scheme=="http")) Process.Start(new ProcessStartInfo(u.AbsoluteUri){UseShellExecute=true});
            };
            web.CoreWebView2.DownloadStarting += delegate(object s,CoreWebView2DownloadStartingEventArgs e) {
                if(smoke){e.ResultFilePath=Path.Combine(data,"download.fcut");e.Handled=true;return;}
                using(var save=new SaveFileDialog { FileName=Path.GetFileName(e.ResultFilePath),OverwritePrompt=true,Title="保存 FCUT 文件" }) {
                    if(save.ShowDialog(this)!=DialogResult.OK)e.Cancel=true; else e.ResultFilePath=save.FileName;
                }
            };
            web.CoreWebView2.ProcessFailed += delegate { status.Text="画面进程异常，请关闭并重新打开 FCUT。"; status.Visible=true;status.BringToFront(); };
            web.CoreWebView2.NavigationCompleted += async delegate(object s,CoreWebView2NavigationCompletedEventArgs e) {
                if(!e.IsSuccess){status.Text="编辑器加载失败："+e.WebErrorStatus;return;}
                ready=true; web.Visible=true; status.Visible=false;
                if(smoke) await SmokeTest();
            };
            web.CoreWebView2.Navigate(origin+"/");
        } catch(WebView2RuntimeNotFoundException) {
            MessageBox.Show("需要 Microsoft Edge WebView2 Runtime。请从微软官网下载 Evergreen Runtime 后重新打开 FCUT。\nhttps://developer.microsoft.com/microsoft-edge/webview2/", "缺少 WebView2",MessageBoxButtons.OK,MessageBoxIcon.Information);
            allowClose=true; Close(); Environment.ExitCode=1;
        } catch(Exception e) {
            if(smoke) File.WriteAllText(Path.Combine(data,"desktop-error.txt"),e.ToString());
            else MessageBox.Show(e.Message,"FCUT 启动失败",MessageBoxButtons.OK,MessageBoxIcon.Error);
            allowClose=true;Close();Environment.ExitCode=1;
        }
    }
    async Task SmokeTest() {
        try {
            string result="false";
            for(int i=0;i<100;i++) {
                result=await web.CoreWebView2.ExecuteScriptAsync("Boolean(document.querySelector('#save-state')?.textContent.includes('已恢复') && document.querySelector('#effect-preview')?.getContext('webgl') && window.fcutDesktopPrepareClose)");
                if(result=="true")break; await Task.Delay(100);
            }
            if(result!="true") throw new Exception("Desktop editor or WebGL did not initialize.");
            await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('#project-name').value='桌面封装验证';document.querySelector('#project-name').dispatchEvent(new Event('change'));");
            await web.CoreWebView2.ExecuteScriptAsync("document.querySelector('#save-project').click()");
            for(int i=0;i<100 && !File.Exists(Path.Combine(data,"download.fcut"));i++) await Task.Delay(100);
            if(!File.Exists(Path.Combine(data,"download.fcut")))throw new Exception("Native project download failed.");
            using(var file=File.Create(Path.Combine(data,"desktop.png"))) await web.CoreWebView2.CapturePreviewAsync(CoreWebView2CapturePreviewImageFormat.Png,file);
            File.WriteAllText(Path.Combine(data,"desktop-ready.txt"),origin+"\n"+backend.Id);
            Close();
        } catch(Exception e) {File.WriteAllText(Path.Combine(data,"desktop-error.txt"),e.ToString());Environment.ExitCode=1;allowClose=true;Close();}
    }
    async void OnClosing(object sender,FormClosingEventArgs e) {
        if(allowClose)return; e.Cancel=true; if(closing)return; closing=true;
        try {
            if(ready && backend!=null && !backend.HasExited) {
                // ExecuteScriptAsync does not await JS promises. The page reports completion via a message.
                var saved=new TaskCompletionSource<bool>();
                EventHandler<CoreWebView2WebMessageReceivedEventArgs> handler=delegate(object s,CoreWebView2WebMessageReceivedEventArgs msg){
                    if(msg.Source.StartsWith(origin+"/")) { string value=msg.TryGetWebMessageAsString();if(value=="close-ok")saved.TrySetResult(true);else if(value=="close-cancel")saved.TrySetResult(false); }
                };
                web.CoreWebView2.WebMessageReceived+=handler;
                try {
                    await web.CoreWebView2.ExecuteScriptAsync("window.fcutDesktopPrepareClose().then(ok=>chrome.webview.postMessage(ok?'close-ok':'close-cancel')).catch(()=>chrome.webview.postMessage('close-cancel'))");
                    if(await Task.WhenAny(saved.Task,Task.Delay(60000))!=saved.Task || !await saved.Task){closing=false;return;}
                }finally{web.CoreWebView2.WebMessageReceived-=handler;}
            }
            if(backend!=null && !backend.HasExited){backend.StandardInput.WriteLine("shutdown");await Task.Run(()=>backend.WaitForExit(5000));}
        }catch(Exception ex){
            if(!smoke && MessageBox.Show("保存未能确认："+ex.Message+"\n仍然关闭？","FCUT",MessageBoxButtons.YesNo,MessageBoxIcon.Warning)!=DialogResult.Yes){closing=false;return;}
        }
        allowClose=true;Close();
    }
    void Cleanup(){if(web!=null)web.Dispose();if(job!=null)job.Dispose();if(backend!=null)backend.Dispose();}
}

// The OS terminates only our backend and its descendants if the window closes or crashes.
sealed class ProcessJob : IDisposable {
    IntPtr handle;
    [StructLayout(LayoutKind.Sequential)] struct Basic { public long PerProcess,PerJob; public uint Flags; public UIntPtr Min,Max; public uint Active; public UIntPtr Affinity; public uint Priority,Scheduling; }
    [StructLayout(LayoutKind.Sequential)] struct IO { public ulong ReadOps,WriteOps,OtherOps,ReadBytes,WriteBytes,OtherBytes; }
    [StructLayout(LayoutKind.Sequential)] struct Extended { public Basic Basic; public IO IO; public UIntPtr ProcessMemory,JobMemory,PeakProcess,PeakJob; }
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode)] static extern IntPtr CreateJobObject(IntPtr attributes,string name);
    [DllImport("kernel32.dll")] static extern bool SetInformationJobObject(IntPtr job,int info,ref Extended value,uint size);
    [DllImport("kernel32.dll")] static extern bool AssignProcessToJobObject(IntPtr job,IntPtr process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);
    public ProcessJob(){handle=CreateJobObject(IntPtr.Zero,null);var info=new Extended();info.Basic.Flags=0x2000;if(handle==IntPtr.Zero || !SetInformationJobObject(handle,9,ref info,(uint)Marshal.SizeOf(info)))throw new Exception("无法创建后台进程管理器。");}
    public void Add(Process p){if(!AssignProcessToJobObject(handle,p.Handle)){p.Kill();throw new Exception("无法管理后台服务进程。");}}
    public void Dispose(){if(handle!=IntPtr.Zero){CloseHandle(handle);handle=IntPtr.Zero;}}
}

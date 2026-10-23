// Optional Windows UI adapter for the generated, hash-pinned catalog payload.
// No profile writes, clipboard, process termination, remote debugger, or shell execution.
using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.IO;
using System.Runtime.InteropServices;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Threading;
using System.Windows.Automation;

public static class RuntimeConsoleBridge {
    static int targetPid;
    static long targetStarted;
    static int uiNodes, tabItems, editInputs, consoleLabels;
    static int promptValueLength=-1;
    static bool promptReadOnly;
    static string promptValueShape="unread";
    static int writtenValueLength=-1;
    static bool resumedOwnPayload;
    static string catalogDialogState="NotRequested";
    static int filenameCandidates,openCandidates;
    static string focusStage="NotChecked";
    static bool foregroundIsDevTools,promptHasFocus;
    static bool activationRequested;
    static string foregroundKind="NotObserved";
    static int observedForegroundPid;
    static int promptProcessId,focusedProcessId;
    static bool focusedNameIsPrompt;
    static int pickerForegroundPid,pickerOwnerPid,pickerZeroForegroundSamples;
    static string pickerWindowClass="NotObserved",pickerForegroundKind="NotObserved";
    static int pickerIdentityBits;
    static bool scriptSubmitted;
    static string devToolsOpenMethod="NotRequested";
    static Process lifetimeParent;
    static long lifetimeParentStarted;
    static string lifetimeParentExe,lifetimeRegistry,lifetimeRegistryHash;
    [StructLayout(LayoutKind.Sequential)] struct INPUT { public uint type; public INPUTUNION data; }
    [StructLayout(LayoutKind.Explicit)] struct INPUTUNION {
        [FieldOffset(0)] public KEYBDINPUT keyboard;
        [FieldOffset(0)] public MOUSEINPUT mouse;
    }
    [StructLayout(LayoutKind.Sequential)] struct KEYBDINPUT { public ushort vk, scan; public uint flags, time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential)] struct MOUSEINPUT { public int x,y; public uint data,flags,time; public UIntPtr extra; }
    [StructLayout(LayoutKind.Sequential,CharSet=CharSet.Unicode)] struct PROCESSENTRY32 {
        public uint size,usage,pid; public UIntPtr heap; public uint module,threads,parentPid; public int priority; public uint flags;
        [MarshalAs(UnmanagedType.ByValTStr,SizeConst=260)] public string exe;
    }
    delegate bool EnumWindow(IntPtr handle, IntPtr param);
    [DllImport("user32.dll")] static extern bool EnumWindows(EnumWindow callback, IntPtr param);
    [DllImport("user32.dll")] static extern bool IsWindowVisible(IntPtr handle);
    [DllImport("user32.dll")] static extern bool IsWindowEnabled(IntPtr handle);
    [DllImport("user32.dll")] static extern bool IsChild(IntPtr parent,IntPtr child);
    [DllImport("user32.dll")] static extern IntPtr GetDlgItem(IntPtr dialog,int id);
    [DllImport("user32.dll")] static extern int GetDlgCtrlID(IntPtr control);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetWindowText(IntPtr handle, StringBuilder text, int count);
    [DllImport("user32.dll", CharSet=CharSet.Unicode)] static extern int GetClassName(IntPtr handle, StringBuilder text, int count);
    [DllImport("user32.dll")] static extern IntPtr GetWindow(IntPtr handle,uint command);
    [DllImport("user32.dll")] static extern uint GetWindowThreadProcessId(IntPtr handle, out uint process);
    [DllImport("user32.dll")] static extern IntPtr GetForegroundWindow();
    [DllImport("user32.dll")] static extern bool SetForegroundWindow(IntPtr handle);
    [DllImport("user32.dll")] static extern uint SendInput(uint count, INPUT[] input, int size);
    [DllImport("user32.dll")] static extern short GetAsyncKeyState(int key);
    [DllImport("user32.dll")] static extern bool PostMessage(IntPtr handle, uint message, IntPtr w, IntPtr l);
    [DllImport("kernel32.dll")] static extern IntPtr CreateToolhelp32Snapshot(uint flags,uint pid);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,EntryPoint="Process32FirstW")] static extern bool Process32First(IntPtr snapshot,ref PROCESSENTRY32 process);
    [DllImport("kernel32.dll",CharSet=CharSet.Unicode,EntryPoint="Process32NextW")] static extern bool Process32Next(IntPtr snapshot,ref PROCESSENTRY32 process);
    [DllImport("kernel32.dll")] static extern bool CloseHandle(IntPtr handle);

    static readonly string[] PromptNames = { "Console prompt", "控制台提示符", "控制台提示", "主控台提示", "主控台提示符" };
    static uint Pid(IntPtr handle) { uint pid; GetWindowThreadProcessId(handle, out pid); return pid; }
    static string Title(IntPtr handle) { var text=new StringBuilder(2048); GetWindowText(handle,text,text.Capacity); return text.ToString(); }
    static string ClassName(IntPtr handle) { var text=new StringBuilder(256); GetClassName(handle,text,text.Capacity); return text.ToString(); }
    public static bool DevToolsTarget(string title, int actualPid, int expectedPid) {
        return actualPid==expectedPid
            && Regex.IsMatch(title,@"^(?:DevTools|Developer Tools) - app://localhost(?:/|$)",RegexOptions.IgnoreCase);
    }
    public static bool ConsolePrompt(string name) { return Array.IndexOf(PromptNames,name)>=0; }
    public static bool ConsolePanel(string name) { return name=="Console" || name=="控制台" || name=="主控台"; }
    public static bool EmptyPrompt(string value) { return value=="" || value=="\n" || value=="\r" || value=="\r\n"; }
    public static string PromptShape(string value) {
        if(value=="")return "empty";
        if(EmptyPrompt(value))return "single-line-break";
        return String.IsNullOrWhiteSpace(value)?"whitespace":"content";
    }
    static string EditorText(string value) { return value.Replace("\r\n","\n").Replace('\r','\n'); }
    public static bool EditorMatches(string actual,string expected) {
        actual=EditorText(actual); expected=EditorText(expected);
        return actual==expected || actual==expected+"\n" || actual+"\n"==expected;
    }
    public static bool OwnPendingPayload(string actual,string template,string marker) {
        if(template==null || marker==null || !Regex.IsMatch(marker,@"^CLAUDE_ZH_APPLIED_[a-f0-9]{32}$"))return false;
        string literal="\""+marker+"\"";
        int slot=template.IndexOf(literal,StringComparison.Ordinal);
        if(slot<0 || slot!=template.LastIndexOf(literal,StringComparison.Ordinal))return false;
        template=EditorText(template); actual=EditorText(actual);
        slot=template.IndexOf(literal,StringComparison.Ordinal);
        string prefix=template.Substring(0,slot),suffix=template.Substring(slot+literal.Length);
        for(int trailing=-1;trailing<=1;trailing++) {
            string candidate=actual;
            if(trailing==-1)candidate=actual+"\n";
            if(trailing==1) { if(!actual.EndsWith("\n",StringComparison.Ordinal))continue; candidate=actual.Substring(0,actual.Length-1); }
            if(candidate.Length<prefix.Length+suffix.Length || !candidate.StartsWith(prefix,StringComparison.Ordinal) || !candidate.EndsWith(suffix,StringComparison.Ordinal))continue;
            string replacement=candidate.Substring(prefix.Length,candidate.Length-prefix.Length-suffix.Length);
            if(replacement.Length>128)continue;
            var parts=Regex.Match(replacement,@"^\(""([A-Z_a-f0-9]+)""\+""([A-Z_a-f0-9]+)""\)$");
            if(parts.Success && Regex.IsMatch(parts.Groups[1].Value+parts.Groups[2].Value,"^"+Regex.Escape(marker)+@"_[a-f0-9]{32}$"))return true;
        }
        return false;
    }
    public static bool MayWrite(bool sameProcess, bool sameFocus, bool editable, string name, string existing,string template=null,string marker=null) {
        return sameProcess && sameFocus && editable && ConsolePrompt(name) && (EmptyPrompt(existing) || OwnPendingPayload(existing,template,marker));
    }
    static List<IntPtr> Tools(int pid) {
        var windows=new List<IntPtr>();
        EnumWindows(delegate(IntPtr h,IntPtr unused) {
            if(IsWindowVisible(h) && DevToolsTarget(Title(h),(int)Pid(h),pid)) windows.Add(h);
            return true;
        },IntPtr.Zero);
        return windows;
    }
    public static bool FileNameField(string name,string id,string parentId) {
        return id=="1148" || parentId=="1148" || name=="File name:" || name=="文件名(N):" || name=="文件名:" || name=="檔案名稱(N):" || name=="檔案名稱:";
    }
    public static bool OpenFileButton(string name,string id) {
        name=(name??"").Replace("&","").Replace(" ","");
        return id=="1" || name=="Open" || name=="Open(O)" || name=="打开(O)" || name=="打开" || name=="開啟(O)" || name=="開啟";
    }
    public static bool NativeOpenIdentity(bool child,bool visible,bool enabled,bool sameProcess,int id,string windowClass) {
        return child && visible && enabled && sameProcess && id==1 && windowClass=="Button";
    }
    static bool NativeOpenButton(IntPtr dialog,IntPtr button,int pid) {
        return button!=IntPtr.Zero && NativeOpenIdentity(IsChild(dialog,button),IsWindowVisible(button),IsWindowEnabled(button),(int)Pid(button)==pid,GetDlgCtrlID(button),ClassName(button));
    }
    public static bool MayActivate(int matches,int dialogs,int tools) { return matches==1 && dialogs==0 && tools>=0 && tools<=1; }
    static int ParentId(int pid) {
        IntPtr snapshot=CreateToolhelp32Snapshot(2,0);
        if(snapshot==new IntPtr(-1))return 0;
        try {
            var entry=new PROCESSENTRY32(); entry.size=(uint)Marshal.SizeOf(typeof(PROCESSENTRY32));
            if(Process32First(snapshot,ref entry))do { if(entry.pid==pid)return (int)entry.parentPid; } while(Process32Next(snapshot,ref entry));
            return 0;
        } finally { CloseHandle(snapshot); }
    }
    public static bool MayUseDialog(bool standard,bool browserOwner,bool sameExe,bool sameGeneration,bool rootOrDirectChild) {
        return standard && browserOwner && sameExe && sameGeneration && rootOrDirectChild;
    }
    static bool DialogIdentity(IntPtr handle,Process browser,string exe,long started,int expectedPid=0,long expectedStart=0) {
        try {
            bool browserAlive=Identity(browser,exe,started);
            if(handle==GetForegroundWindow())pickerIdentityBits=browserAlive?64:0;
            if(!browserAlive)return false;
            int pid=(int)Pid(handle);
            var dialog=Process.GetProcessById(pid);
            long dialogStart=dialog.StartTime.ToUniversalTime().Ticks;
            if(expectedPid!=0 && (pid!=expectedPid || dialogStart!=expectedStart))return false;
            bool visible=IsWindowVisible(handle),standard=ClassName(handle)=="#32770",owner=(int)Pid(GetWindow(handle,4))==browser.Id;
            bool sameExe=Identity(dialog,exe,dialogStart),generation=dialogStart>=started,family=pid==browser.Id || ParentId(pid)==browser.Id;
            if(handle==GetForegroundWindow())pickerIdentityBits=(visible?1:0)|(standard?2:0)|(owner?4:0)|(sameExe?8:0)|(generation?16:0)|(family?32:0)|64;
            return MayUseDialog(visible && standard,owner,sameExe,generation,family);
        } catch { return false; }
    }
    static List<IntPtr> FileDialogs(Process browser,string exe,long started) {
        var windows=new List<IntPtr>();
        EnumWindows(delegate(IntPtr h,IntPtr unused) {
            if(IsWindowVisible(h) && ClassName(h)=="#32770" && (int)Pid(GetWindow(h,4))==browser.Id && DialogIdentity(h,browser,exe,started))windows.Add(h);
            return true;
        },IntPtr.Zero);
        return windows;
    }
    static bool CatalogForeground(Process process,string exe,long started,IntPtr handle,int dialogPid,long dialogStart,string stage) {
        focusStage=stage;
        var clock=Stopwatch.StartNew();
        do {
            if(!DialogIdentity(handle,process,exe,started,dialogPid,dialogStart))return false;
            IntPtr current=GetForegroundWindow();
            pickerForegroundPid=(int)Pid(current); pickerOwnerPid=(int)Pid(GetWindow(current,4));
            pickerWindowClass=ClassName(current);
            if(!Regex.IsMatch(pickerWindowClass,@"^[a-zA-Z0-9_#.-]{1,80}$"))pickerWindowClass="OtherClass";
            pickerForegroundKind=current==handle?"OriginalClaudeChild":pickerForegroundPid==process.Id?"OriginalClaude":pickerForegroundPid==0?"NoWindow":"OtherApplication";
            if(current==handle)return true;
            if(pickerForegroundPid!=0 && pickerForegroundPid!=process.Id)return false;
            if(pickerForegroundPid==process.Id) {
                var dialogs=FileDialogs(process,exe,started);
                if(dialogs.Count!=1 || dialogs[0]!=handle)return false;
                SetForegroundWindow(handle);
            }
            Thread.Sleep(50);
        } while(clock.ElapsedMilliseconds<1000);
        return false;
    }
    static string SelectCatalog(Process process,string exe,long started,string catalog,HashSet<IntPtr> prior) {
        catalogDialogState="Waiting";
        var clock=Stopwatch.StartNew();
        while(clock.ElapsedMilliseconds<15000) {
            if(!Identity(process,exe,started))return "ApplicationExited";
            IntPtr foreground=GetForegroundWindow();
            pickerForegroundPid=(int)Pid(foreground); pickerOwnerPid=(int)Pid(GetWindow(foreground,4));
            pickerWindowClass=ClassName(foreground);
            if(!Regex.IsMatch(pickerWindowClass,@"^[a-zA-Z0-9_#.-]{1,80}$"))pickerWindowClass="OtherClass";
            pickerForegroundKind=pickerForegroundPid==0?"NoWindow":pickerForegroundPid==process.Id?"OriginalClaude":"OtherApplication";
            if(pickerForegroundPid==0) { pickerZeroForegroundSamples++; Thread.Sleep(100); continue; }
            if(pickerForegroundPid!=process.Id) {
                if(DialogIdentity(foreground,process,exe,started))pickerForegroundKind="OriginalClaudeChild";
                else {
                // The helper process/module list and modal window can become
                // queryable just after foreground activation. No input is sent
                // during this bounded wait; every identity condition must pass.
                if(pickerOwnerPid==process.Id && pickerWindowClass=="#32770" && clock.ElapsedMilliseconds<2000) { Thread.Sleep(100); continue; }
                try {
                    var active=Process.GetProcessById(pickerForegroundPid);
                    string activePath=Path.GetFullPath(active.MainModule.FileName);
                    string windows=Environment.GetFolderPath(Environment.SpecialFolder.Windows);
                    if(String.Equals(activePath,Path.Combine(windows,"explorer.exe"),StringComparison.OrdinalIgnoreCase))pickerForegroundKind="WindowsExplorer";
                    if(String.Equals(activePath,Path.Combine(windows,"System32","ApplicationFrameHost.exe"),StringComparison.OrdinalIgnoreCase))pickerForegroundKind="WindowsApplicationFrameHost";
                } catch { pickerForegroundKind="UnreadableApplication"; }
                return "FocusChanged";
                }
            }
            var dialogs=FileDialogs(process,exe,started).FindAll(h=>!prior.Contains(h));
            if(dialogs.Count>1)return "AmbiguousCatalogDialog";
            if(dialogs.Count==0) { Thread.Sleep(100); continue; }
            IntPtr handle=dialogs[0];
            if(GetForegroundWindow()!=handle) { Thread.Sleep(100); continue; }
            int dialogPid=(int)Pid(handle);
            long dialogStart=Process.GetProcessById(dialogPid).StartTime.ToUniversalTime().Ticks;
            var root=AutomationElement.FromHandle(handle);
            AutomationElement filename=null,open=null;
            IntPtr nativeOpen=GetDlgItem(handle,1);
            if(!NativeOpenButton(handle,nativeOpen,dialogPid))nativeOpen=IntPtr.Zero;
            filenameCandidates=0; openCandidates=0;
            foreach(AutomationElement edit in root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit))) {
                var parent=TreeWalker.ControlViewWalker.GetParent(edit);
                if(FileNameField(edit.Current.Name,edit.Current.AutomationId,parent==null?"":parent.Current.AutomationId)) { filenameCandidates++; filename=edit; }
            }
            if(nativeOpen!=IntPtr.Zero)openCandidates=1;
            else {
                var openLocator=new OrCondition(new PropertyCondition(AutomationElement.AutomationIdProperty,"1"),new PropertyCondition(AutomationElement.NameProperty,"打开(O)"),new PropertyCondition(AutomationElement.NameProperty,"Open"),new PropertyCondition(AutomationElement.NameProperty,"開啟(O)"));
                foreach(AutomationElement button in root.FindAll(TreeScope.Descendants,openLocator))
                    if(OpenFileButton(button.Current.Name,button.Current.AutomationId)) { openCandidates++; open=button; }
            }
            if(filenameCandidates>1 || openCandidates>1)return "AmbiguousCatalogControls";
            if(filename==null || (open==null && nativeOpen==IntPtr.Zero)) { catalogDialogState=filename==null?"FileNameNotFound":"OpenButtonNotFound"; Thread.Sleep(150); continue; }
            object valueObject,invokeObject=null;
            if(!filename.TryGetCurrentPattern(ValuePattern.Pattern,out valueObject) || ((ValuePattern)valueObject).Current.IsReadOnly)return "CatalogFileNameNotEditable";
            if(nativeOpen==IntPtr.Zero && !open.TryGetCurrentPattern(InvokePattern.Pattern,out invokeObject))return "CatalogOpenNotInvokable";
            if(!CatalogForeground(process,exe,started,handle,dialogPid,dialogStart,"PickerBeforeFill"))return "FocusChanged";
            filename.SetFocus();
            if(!CatalogForeground(process,exe,started,handle,dialogPid,dialogStart,"PickerFileNameFocus") || !Same(filename,AutomationElement.FocusedElement))return "CatalogFileNameFocusNotVerified";
            var value=(ValuePattern)valueObject;
            value.SetValue(catalog);
            if(value.Current.Value!=catalog)return "CatalogFileNameNotVerified";
            if(!CatalogForeground(process,exe,started,handle,dialogPid,dialogStart,"PickerBeforeOpen") || !Same(filename,AutomationElement.FocusedElement))return "FocusChanged";
            catalogDialogState="OpenRequested";
            if(nativeOpen!=IntPtr.Zero) {
                if(!NativeOpenButton(handle,nativeOpen,dialogPid))return "CatalogOpenIdentityChanged";
                if(!CatalogForeground(process,exe,started,handle,dialogPid,dialogStart,"PickerNativeOpen"))return "FocusChanged";
                if(!PostMessage(nativeOpen,0x00F5,IntPtr.Zero,IntPtr.Zero))return "CatalogOpenNotDelivered";
                catalogDialogState="SelectedNative";
                return null;
            }
            // Invoking Open can destroy its own UIA element before Invoke
            // returns. The fresh console acknowledgement decides success;
            // never repeat the file selection after an uncertain outcome.
            try { ((InvokePattern)invokeObject).Invoke(); catalogDialogState="Selected"; }
            catch(ElementNotAvailableException) { catalogDialogState="OpenOutcomePending"; }
            return null;
        }
        return catalogDialogState=="Waiting"?"CatalogDialogNotAvailable":catalogDialogState;
    }
    static bool Same(AutomationElement a, AutomationElement b) {
        if(a==null || b==null) return false;
        var x=a.GetRuntimeId(); var y=b.GetRuntimeId();
        if(x.Length!=y.Length)return false;
        for(int i=0;i<x.Length;i++)if(x[i]!=y[i])return false;
        return true;
    }
    public static bool FrontendDocument(string value,int actualPid,int expectedPid,bool enabled,bool visible) {
        Uri uri;
        return actualPid==expectedPid && enabled && visible && Uri.TryCreate(value,UriKind.Absolute,out uri)
            && uri.Scheme=="app" && uri.Host=="localhost" && uri.IsDefaultPort && uri.UserInfo.Length==0;
    }
    static bool FocusInside(AutomationElement document,AutomationElement focused,int pid) {
        for(int depth=0;focused!=null && depth<64;depth++) {
            if(focused.Current.ProcessId!=pid)return false;
            if(Same(document,focused))return true;
            focused=TreeWalker.ControlViewWalker.GetParent(focused);
        }
        return false;
    }
    static string FocusFrontend(Process process,string exe,long started,IntPtr handle,int timeout) {
        var clock=Stopwatch.StartNew();
        while(clock.ElapsedMilliseconds<timeout) {
            if(!Identity(process,exe,started))return "ApplicationExited";
            if(GetForegroundWindow()!=handle)return "FocusChanged";
            focusStage="FrontendReady";
            var documents=new List<AutomationElement>();
            try {
                var root=AutomationElement.FromHandle(handle);
                foreach(AutomationElement document in root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Document))) {
                    object value;
                    if(document.TryGetCurrentPattern(ValuePattern.Pattern,out value)
                        && FrontendDocument(((ValuePattern)value).Current.Value,document.Current.ProcessId,process.Id,document.Current.IsEnabled,!document.Current.IsOffscreen))documents.Add(document);
                }
                if(documents.Count>1)return "AmbiguousFrontend";
                if(documents.Count==1) {
                    if(!Identity(process,exe,started) || GetForegroundWindow()!=handle)return "FocusChanged";
                    focusStage="FrontendFocus";
                    documents[0].SetFocus();
                    if(FocusInside(documents[0],AutomationElement.FocusedElement,process.Id))return null;
                }
            } catch(ElementNotAvailableException) { /* The initial renderer can be replaced while loading. */ }
            Thread.Sleep(100);
        }
        return "FrontendFocusNotVerified";
    }
    public static bool DevToolsMenuName(int stage,string name) {
        if(stage==0)return name=="Menu" || name=="菜单" || name=="選單";
        if(stage==1)return name=="Developer" || name=="开发者" || name=="開發者";
        return stage==2 && (name=="Show Dev Tools" || name=="显示开发者工具" || name=="显示开发工具" || name=="顯示開發者工具" || name=="顯示開發人員工具");
    }
    static string OpenDevToolsMenuStage(Process process,string exe,long started,IntPtr handle,int stage) {
        var clock=Stopwatch.StartNew();
        while(clock.ElapsedMilliseconds<5000) {
            if(!Identity(process,exe,started))return "ApplicationExited";
            if(Tools(process.Id).Count>0)return null;
            if(GetForegroundWindow()!=handle)return "FocusChanged";
            var matches=new List<AutomationElement>();
            try {
                var root=AutomationElement.FromHandle(handle);
                var type=stage==0?ControlType.Button:ControlType.MenuItem;
                foreach(AutomationElement item in root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,type)))
                    if(item.Current.ProcessId==process.Id && item.Current.IsEnabled && !item.Current.IsOffscreen && DevToolsMenuName(stage,item.Current.Name))matches.Add(item);
                if(matches.Count>1)return "AmbiguousDevToolsMenu";
                if(matches.Count==1) {
                    if(!Identity(process,exe,started) || GetForegroundWindow()!=handle)return "FocusChanged";
                    if(Tools(process.Id).Count>0)return null;
                    object pattern;
                    focusStage="DevToolsMenu"+stage;
                    if(stage==1 && matches[0].TryGetCurrentPattern(ExpandCollapsePattern.Pattern,out pattern)) {
                        ((ExpandCollapsePattern)pattern).Expand(); return null;
                    }
                    if(!matches[0].TryGetCurrentPattern(InvokePattern.Pattern,out pattern))return "DevToolsMenuNotInvokable";
                    ((InvokePattern)pattern).Invoke(); return null;
                }
            } catch(ElementNotAvailableException) { /* Native menus are created asynchronously. */ }
            Thread.Sleep(100);
        }
        return "DevToolsMenuNotAvailable";
    }
    static bool ProcessIdentity(Process process,string exe,long started) {
        try { process.Refresh(); return !process.HasExited && process.StartTime.ToUniversalTime().Ticks==started
            && String.Equals(Path.GetFullPath(process.MainModule.FileName),exe,StringComparison.OrdinalIgnoreCase); }
        catch { return false; }
    }
    static bool LifetimeAlive() {
        if(lifetimeParent==null && lifetimeRegistry==null)return true;
        try {
            if(lifetimeParent==null || lifetimeRegistry==null || !ProcessIdentity(lifetimeParent,lifetimeParentExe,lifetimeParentStarted))return false;
            using(var sha=SHA256.Create())using(var stream=File.OpenRead(lifetimeRegistry))
                return BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant()==lifetimeRegistryHash;
        } catch { return false; }
    }
    static bool Identity(Process process,string exe,long started) { return LifetimeAlive() && ProcessIdentity(process,exe,started); }
    static void Keys(ushort[] keys) {
        foreach(int key in new[]{0x10,0x11,0x12}) if((GetAsyncKeyState(key)&0x8000)!=0) throw new InvalidOperationException("ModifierKeyHeld");
        var input=new INPUT[keys.Length*2];
        for(int i=0;i<keys.Length;i++)input[i]=new INPUT {type=1,data=new INPUTUNION {keyboard=new KEYBDINPUT {vk=keys[i]}}};
        for(int i=0;i<keys.Length;i++)input[keys.Length+i]=new INPUT {type=1,data=new INPUTUNION {keyboard=new KEYBDINPUT {vk=keys[keys.Length-1-i],flags=2}}};
        // Individual key events are intentionally checked; never retry a partial chord.
        if(SendInput((uint)input.Length,input,Marshal.SizeOf(typeof(INPUT)))!=input.Length) {
            var release=new INPUT[keys.Length];
            for(int i=0;i<keys.Length;i++)release[i]=new INPUT {type=1,data=new INPUTUNION {keyboard=new KEYBDINPUT {vk=keys[keys.Length-1-i],flags=2}}};
            SendInput((uint)release.Length,release,Marshal.SizeOf(typeof(INPUT)));
            throw new InvalidOperationException("InputNotDelivered");
        }
    }
    static bool Acknowledged(AutomationElement root,string marker) {
        var texts=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Text));
        foreach(AutomationElement text in texts)if(text.Current.Name==marker)return true;
        return false;
    }
    static string Apply(string exe,string payload,string hash,string marker,int timeout,string catalog,string catalogHash,bool activateClaude) {
        if(!LifetimeAlive())return "OwnerChanged";
        exe=Path.GetFullPath(exe);
        if(!File.Exists(exe) || !String.Equals(Path.GetFileName(exe),"Claude.exe",StringComparison.OrdinalIgnoreCase))return "InvalidApplication";
        if(catalog!=null) {
            catalog=Path.GetFullPath(catalog);
            var data=new FileInfo(catalog);
            if(!Regex.IsMatch(catalogHash,@"^[a-f0-9]{64}$") || !data.Exists || data.Length<1 || data.Length>8*1024*1024)return "InvalidCatalog";
            using(var sha=SHA256.Create())using(var stream=File.OpenRead(catalog))
                if(BitConverter.ToString(sha.ComputeHash(stream)).Replace("-","").ToLowerInvariant()!=catalogHash)return "CatalogHashMismatch";
        }
        if(!Regex.IsMatch(hash,@"^[a-f0-9]{64}$") || !Regex.IsMatch(marker,@"^CLAUDE_ZH_APPLIED_[a-f0-9]{32}$"))return "InvalidManifest";
        var info=new FileInfo(payload);
        if(!info.Exists || info.Length<1 || info.Length>8*1024*1024)return "InvalidPayload";
        byte[] bytes=File.ReadAllBytes(payload);
        using(var sha=SHA256.Create())if(BitConverter.ToString(sha.ComputeHash(bytes)).Replace("-","").ToLowerInvariant()!=hash)return "PayloadHashMismatch";
        string script=new UTF8Encoding(false,true).GetString(bytes);
        string template=script,manifestMarker=marker;
        string literal="\""+marker+"\"";
        if(script.IndexOf(literal,StringComparison.Ordinal)<0 || script.IndexOf(literal,StringComparison.Ordinal)!=script.LastIndexOf(literal,StringComparison.Ordinal))return "MissingAcknowledgement";
        // Fresh per attempt; the full acknowledgement never appears in the echoed source.
        marker=marker+"_"+Guid.NewGuid().ToString("N");
        int split=marker.Length/2;
        script=script.Replace(literal,"(\""+marker.Substring(0,split)+"\"+\""+marker.Substring(split)+"\")");
        activationRequested=activateClaude;
        // Explicit activation selects a unique visible process by its full
        // executable path. It neither launches Claude nor changes the default
        // foreground-only mode used by an ordinary watcher.
        if(activateClaude) {
            var matches=new List<Process>();
            foreach(var candidate in Process.GetProcessesByName("Claude")) {
                try {
                    if(candidate.MainWindowHandle!=IntPtr.Zero && String.Equals(Path.GetFullPath(candidate.MainModule.FileName),exe,StringComparison.OrdinalIgnoreCase))matches.Add(candidate);
                } catch { return "OriginalIdentityUnreadable"; }
            }
            if(matches.Count!=1)return matches.Count==0?"OriginalWindowNotFound":"AmbiguousOriginalWindows";
            var selected=matches[0];
            var selectedTools=Tools(selected.Id);
            long selectedStart=selected.StartTime.ToUniversalTime().Ticks;
            var dialogs=FileDialogs(selected,exe,selectedStart);
            if(!MayActivate(matches.Count,dialogs.Count,selectedTools.Count))return dialogs.Count>0?"ExistingFileDialog":"AmbiguousDevTools";
            IntPtr selectedWindow=selectedTools.Count==1?selectedTools[0]:selected.MainWindowHandle;
            if(!Identity(selected,exe,selectedStart) || (int)Pid(selectedWindow)!=selected.Id || !IsWindowVisible(selectedWindow))return "ApplicationIdentityChanged";
            targetPid=selected.Id; targetStarted=selectedStart;
            SetForegroundWindow(selectedWindow);
            var activationClock=Stopwatch.StartNew();
            while(GetForegroundWindow()!=selectedWindow && activationClock.ElapsedMilliseconds<1000)Thread.Sleep(50);
            if(GetForegroundWindow()!=selectedWindow)return "ForegroundActivationDenied";
        }
        IntPtr foreground=GetForegroundWindow();
        observedForegroundPid=(int)Pid(foreground);
        foregroundKind=observedForegroundPid==0?"NoWindow":"OtherApplication";
        Process process;
        try { process=Process.GetProcessById((int)Pid(foreground)); }
        catch { return "DeferredNoForegroundClaude"; }
        long started;
        try { started=process.StartTime.ToUniversalTime().Ticks; }
        catch { return "ApplicationIdentityUnreadable"; }
        if(!Identity(process,exe,started)) {
            if(String.Equals(process.ProcessName,"Claude",StringComparison.OrdinalIgnoreCase))foregroundKind="OtherClaudeOrUnreadable";
            return "DeferredNoForegroundClaude";
        }
        foregroundKind="OriginalClaude";
        int pid=process.Id;
        targetPid=pid; targetStarted=started;
        var existing=Tools(pid);
        if(existing.Count>1)return "AmbiguousDevTools";
        bool opened=existing.Count==0;
        devToolsOpenMethod=opened?"Shortcut":"ExistingWindow";
        if(opened) {
            if(Regex.IsMatch(Title(foreground),@"^(?:DevTools|Developer Tools) - ",RegexOptions.IgnoreCase))return "WrongDevToolsOrigin";
            if(GetForegroundWindow()!=foreground || !Identity(process,exe,started))return "FocusChanged";
            string focusFailure=FocusFrontend(process,exe,started,foreground,timeout);
            if(focusFailure!=null)return focusFailure;
            if(GetForegroundWindow()!=foreground || !Identity(process,exe,started))return "FocusChanged";
            Keys(new ushort[]{0x11,0x12,0x49});
        }
        var clock=Stopwatch.StartNew();
        List<IntPtr> tools=existing;
        bool menuAttempted=false;
        while(tools.Count==0 && clock.ElapsedMilliseconds<timeout) {
            Thread.Sleep(150); if(!Identity(process,exe,started))return "ApplicationExited";
            if(Pid(GetForegroundWindow())!=pid)return "FocusChanged";
            tools=Tools(pid);
            if(tools.Count==0 && !menuAttempted && clock.ElapsedMilliseconds>=3000) {
                menuAttempted=true; devToolsOpenMethod="Menu";
                for(int stage=0;stage<3;stage++) {
                    string failure=OpenDevToolsMenuStage(process,exe,started,foreground,stage);
                    if(failure!=null)return failure;
                }
                tools=Tools(pid);
            }
        }
        if(tools.Count!=1)return tools.Count==0?"DevToolsNotAvailable":"AmbiguousDevTools";
        IntPtr handle=tools[0];
        // An existing undocked DevTools window can be behind Claude. UIA SetFocus
        // alone does not activate its top-level window. Switch only within the
        // already-foreground verified Claude process, never from another app.
        if(Pid(GetForegroundWindow())!=pid || !Identity(process,exe,started))return "FocusChanged";
        if(GetForegroundWindow()!=handle) {
            SetForegroundWindow(handle);
            var focusClock=Stopwatch.StartNew();
            while(GetForegroundWindow()!=handle && focusClock.ElapsedMilliseconds<1000) {
                if(Pid(GetForegroundWindow())!=pid)return "FocusChanged";
                Thread.Sleep(50);
            }
            if(GetForegroundWindow()!=handle)return "DevToolsNotForeground";
        }
        var root=AutomationElement.FromHandle(handle);
        AutomationElement console=null;
        // Chromium may publish the renderer accessibility tree asynchronously on
        // first UIA access. Wait for controls instead of treating an empty tree
        // immediately after opening DevTools as a missing Console tab.
        while(console==null && clock.ElapsedMilliseconds<timeout) {
            if(!Identity(process,exe,started))return "ApplicationExited";
            if(Pid(GetForegroundWindow())!=pid)return "FocusChanged";
            root=AutomationElement.FromHandle(handle);
            var consoleNames=new OrCondition(new PropertyCondition(AutomationElement.NameProperty,"Console"),new PropertyCondition(AutomationElement.NameProperty,"控制台"),new PropertyCondition(AutomationElement.NameProperty,"主控台"));
            var consoleTypes=new OrCondition(new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.TabItem),new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Button));
            // Let the provider filter controls. Reading every log node's Name
            // caused thousands of cross-process UIA calls on a busy Console.
            var nodes=root.FindAll(TreeScope.Descendants,new AndCondition(consoleNames,consoleTypes));
            uiNodes=nodes.Count; tabItems=0; editInputs=0; consoleLabels=0;
            foreach(AutomationElement node in nodes) {
                var type=node.Current.ControlType;
                if(type==ControlType.TabItem)tabItems++;
                if(type==ControlType.Edit)editInputs++;
                if(!ConsolePanel(node.Current.Name))continue;
                consoleLabels++;
                if(type!=ControlType.TabItem && type!=ControlType.Button)continue;
                if(console!=null)return "AmbiguousConsole";
                console=node;
            }
            if(console==null)Thread.Sleep(200);
        }
        if(console==null)return "ConsoleTabNotFound";
        if(Pid(GetForegroundWindow())!=pid || !Identity(process,exe,started))return "FocusChanged";
        object select;
        if(console.TryGetCurrentPattern(SelectionItemPattern.Pattern,out select))((SelectionItemPattern)select).Select();
        else if(console.Current.ControlType==ControlType.Button && console.TryGetCurrentPattern(InvokePattern.Pattern,out select))((InvokePattern)select).Invoke();
        else return "ConsoleTabNotSelectable";
        AutomationElement prompt=null;
        while(prompt==null && clock.ElapsedMilliseconds<timeout) {
            var edits=root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit));
            foreach(AutomationElement edit in edits)if(ConsolePrompt(edit.Current.Name)) { if(prompt!=null)return "AmbiguousConsolePrompt"; prompt=edit; }
            if(prompt==null)Thread.Sleep(150);
        }
        if(prompt==null)return "ConsolePromptNotFound";
        object valueObject;
        if(!prompt.TryGetCurrentPattern(ValuePattern.Pattern,out valueObject))return "ConsoleValuePatternUnavailable";
        var value=(ValuePattern)valueObject;
        string initialValue=value.Current.Value;
        promptReadOnly=value.Current.IsReadOnly; promptValueLength=initialValue.Length; promptValueShape=PromptShape(initialValue);
        if(promptReadOnly)return "ConsolePromptReadOnly";
        resumedOwnPayload=OwnPendingPayload(initialValue,template,manifestMarker);
        if(!EmptyPrompt(initialValue) && !resumedOwnPayload)return "ConsolePromptNotEmpty";
        if(Pid(GetForegroundWindow())!=pid || !Identity(process,exe,started))return "FocusChanged";
        prompt.SetFocus();
        var promptFocusClock=Stopwatch.StartNew();
        bool focusVerified=false;
        while(promptFocusClock.ElapsedMilliseconds<2000) {
            if(Pid(GetForegroundWindow())!=pid || !Identity(process,exe,started))return "FocusChanged";
            var focused=AutomationElement.FocusedElement;
            focusStage="PromptFocus"; foregroundIsDevTools=GetForegroundWindow()==handle;
            promptHasFocus=Same(prompt,focused); promptProcessId=prompt.Current.ProcessId;
            focusedProcessId=focused==null?0:focused.Current.ProcessId;
            focusedNameIsPrompt=focused!=null && ConsolePrompt(focused.Current.Name);
            if(MayWrite(promptProcessId==pid && foregroundIsDevTools,promptHasFocus,
                !value.Current.IsReadOnly,prompt.Current.Name,value.Current.Value,template,manifestMarker)) { focusVerified=true; break; }
            Thread.Sleep(100);
        }
        if(!focusVerified)return promptProcessId!=pid?"ConsolePromptProcessMismatch":"ConsoleFocusNotVerified";
        value.SetValue(script);
        var valueClock=Stopwatch.StartNew();
        bool verified=false;
        while(valueClock.ElapsedMilliseconds<5000) {
            focusStage="ValueReadback"; foregroundIsDevTools=GetForegroundWindow()==handle;
            if(!Identity(process,exe,started) || !foregroundIsDevTools)return "FocusChangedBeforeExecute";
            // Chromium can replace its editor accessibility node after SetValue.
            // Resolve the unique current prompt without writing or moving focus;
            // require both exact payload readback and focus on that current node.
            try {
                AutomationElement current=null;
                foreach(AutomationElement edit in root.FindAll(TreeScope.Descendants,new PropertyCondition(AutomationElement.ControlTypeProperty,ControlType.Edit))) {
                    if(!ConsolePrompt(edit.Current.Name))continue;
                    if(current!=null)return "AmbiguousConsolePrompt";
                    current=edit;
                }
                object currentValue;
                if(current!=null && current.Current.ProcessId==pid && current.Current.IsEnabled && !current.Current.IsOffscreen
                    && current.TryGetCurrentPattern(ValuePattern.Pattern,out currentValue)) {
                    var observed=(ValuePattern)currentValue;
                    string written=observed.Current.Value; writtenValueLength=written.Length;
                    promptHasFocus=Same(current,AutomationElement.FocusedElement);
                    if(!observed.Current.IsReadOnly && EditorMatches(written,script) && promptHasFocus) {
                        prompt=current; value=observed; verified=true; break;
                    }
                }
            } catch(ElementNotAvailableException) { /* Wait for the replacement node. */ }
            Thread.Sleep(100);
        }
        if(!verified)return "ConsoleValueNotVerified";
        // Address Enter only to the verified DevTools HWND, never the foreground chat.
        if(!DevToolsTarget(Title(handle),(int)Pid(handle),pid))return "DevToolsIdentityChanged";
        var priorDialogs=new HashSet<IntPtr>(FileDialogs(process,exe,started));
        if(priorDialogs.Count>0)return "ExistingFileDialog";
        focusStage="BeforeExecute"; foregroundIsDevTools=GetForegroundWindow()==handle; promptHasFocus=Same(prompt,AutomationElement.FocusedElement);
        if(!foregroundIsDevTools || !promptHasFocus)return "FocusChangedBeforeExecute";
        scriptSubmitted=true;
        if(!PostMessage(handle,0x100,new IntPtr(0x0D),IntPtr.Zero))return "ExecuteNotDelivered";
        PostMessage(handle,0x101,new IntPtr(0x0D),IntPtr.Zero);
        if(catalog!=null) {
            string failure=SelectCatalog(process,exe,started,catalog,priorDialogs);
            if(failure!=null)return failure;
        }
        clock.Restart();
        bool focusAfterPicker=catalog==null;
        while(clock.ElapsedMilliseconds<timeout) {
            if(!Identity(process,exe,started))return "ApplicationExited";
            bool acknowledged=false;
            if(!IsWindowVisible(handle) || !DevToolsTarget(Title(handle),(int)Pid(handle),pid))return "DevToolsClosedBeforeAcknowledgement";
            // A file dialog owned by the main window can return focus there.
            // Bring this exact DevTools window back only while Claude retains
            // foreground ownership, after its file dialog has disappeared.
            if(!focusAfterPicker && FileDialogs(process,exe,started).Count==0 && Pid(GetForegroundWindow())==pid) {
                if(!Identity(process,exe,started))return "ApplicationExited";
                focusStage="AcknowledgementFocus";
                SetForegroundWindow(handle);
                focusAfterPicker=GetForegroundWindow()==handle;
            }
            try { root=AutomationElement.FromHandle(handle); acknowledged=Acknowledged(root,marker); }
            catch(ElementNotAvailableException) { Thread.Sleep(200); continue; }
            if(acknowledged) {
                // Close only the exact DevTools window opened by this invocation.
                if(opened && Pid(GetForegroundWindow())==pid && EmptyPrompt(value.Current.Value) && IsWindowVisible(handle) && DevToolsTarget(Title(handle),(int)Pid(handle),pid))
                    PostMessage(handle,0x10,IntPtr.Zero,IntPtr.Zero);
                return "Applied";
            }
            Thread.Sleep(200);
        }
        return "ApplicationNotAcknowledged";
    }
    static void Require(bool condition) { if(!condition)throw new Exception("SelfTestFailed"); }
    static void SelfTest(int expectedParent=0) {
        Require(DevToolsMenuName(0,"Menu"));
        Require(DevToolsMenuName(0,"菜单"));
        Require(DevToolsMenuName(1,"Developer"));
        Require(DevToolsMenuName(1,"开发者"));
        Require(DevToolsMenuName(2,"Show Dev Tools"));
        Require(!DevToolsMenuName(2,"Show All Dev Tools"));
        Require(!DevToolsMenuName(2,"Enable Main Process Debugger"));
        Require(!DevToolsMenuName(2,"Show Dev Tools for another app"));
        Require(!DevToolsMenuName(0,"New"));
        Require(!DevToolsMenuName(1,"Help"));
        Require(FrontendDocument("app://localhost/epitaxy?coldLaunch=1",5,5,true,true));
        Require(!FrontendDocument("app://localhost.evil/epitaxy",5,5,true,true));
        Require(!FrontendDocument("https://localhost/epitaxy",5,5,true,true));
        Require(!FrontendDocument("app://user@localhost/epitaxy",5,5,true,true));
        Require(!FrontendDocument("app://localhost:1234/epitaxy",5,5,true,true));
        Require(!FrontendDocument("app://localhost/epitaxy",6,5,true,true));
        Require(!FrontendDocument("app://localhost/epitaxy",5,5,false,true));
        Require(!FrontendDocument("app://localhost/epitaxy",5,5,true,false));
        Require(DevToolsTarget("DevTools - app://localhost/new",5,5));
        Require(!DevToolsTarget("Claude",5,5));
        Require(!DevToolsTarget("DevTools - app://localhost.evil/new",5,5));
        Require(!DevToolsTarget("DevTools - https://example.test/",5,5));
        Require(!DevToolsTarget("DevTools - app://localhost/new",6,5));
        Require(DevToolsTarget("Developer Tools - app://localhost/epitaxy",5,5));
        Require(!DevToolsTarget("Developer Tools - app://localhost.evil/epitaxy",5,5));
        Require(!DevToolsTarget("Developer Tools - https://example.test/",5,5));
        Require(!DevToolsTarget("Developer Tools - app://localhost/epitaxy",6,5));
        Require(!DevToolsTarget("Claude - Developer Tools - app://localhost/epitaxy",5,5));
        Require(MayWrite(true,true,true,"Console prompt",""));
        Require(MayWrite(true,true,true,"控制台提示符",""));
        Require(!MayWrite(true,false,true,"Console prompt",""));
        Require(!MayWrite(false,true,true,"Console prompt",""));
        Require(!MayWrite(true,true,true,"Message Claude",""));
        Require(!MayWrite(true,true,true,"Console prompt","unfinished command"));
        Require(!MayWrite(true,true,false,"Console prompt",""));
        Require(ConsolePanel("Console"));
        Require(ConsolePanel("控制台"));
        Require(!ConsolePanel("Console output"));
        Require(!ConsolePanel("Message Claude"));
        Require(MayWrite(true,true,true,"Console prompt","\n"));
        Require(MayWrite(true,true,true,"Console prompt","\r\n"));
        Require(!MayWrite(true,true,true,"Console prompt"," "));
        Require(!MayWrite(true,true,true,"Console prompt","\n\n"));
        Require(!MayWrite(true,true,true,"Console prompt","\nunfinished command"));
        Require(!MayWrite(true,true,false,"Console prompt","\n"));
        Require(PromptShape("\r\n")=="single-line-break");
        Require(PromptShape("secret draft")=="content");
        Require(EditorMatches("a\r\nb\r\n","a\nb\n"));
        Require(EditorMatches("a\n\n","a\n"));
        Require(!EditorMatches("a\n\n\n","a\n"));
        Require(!EditorMatches("a ","a"));
        Require(!EditorMatches("different","expected"));
        string fixedMarker="CLAUDE_ZH_APPLIED_"+new string('a',32);
        string template="prefix\nconsole.info(\""+fixedMarker+"\");\nsuffix\n";
        string ack=fixedMarker+"_"+new string('b',32);
        string pending=template.Replace("\""+fixedMarker+"\"","(\""+ack.Substring(0,ack.Length/2)+"\"+\""+ack.Substring(ack.Length/2)+"\")");
        Require(OwnPendingPayload(pending,template,fixedMarker));
        Require(OwnPendingPayload(pending.Replace("\n","\r\n")+"\r\n",template,fixedMarker));
        Require(!OwnPendingPayload(pending+"extra()",template,fixedMarker));
        Require(!OwnPendingPayload(pending.Replace("prefix","changed"),template,fixedMarker));
        Require(!OwnPendingPayload(pending,template,fixedMarker.Replace('a','c')));
        Require(!OwnPendingPayload(template,template,fixedMarker));
        Require(MayWrite(true,true,true,"Console prompt",pending,template,fixedMarker));
        Require(!MayWrite(true,false,true,"Console prompt",pending,template,fixedMarker));
        Require(FileNameField("File name:","1001","1148"));
        Require(FileNameField("文件名(N):","1001",""));
        Require(!FileNameField("Search","1001","search"));
        Require(!FileNameField("Message Claude","", ""));
        Require(OpenFileButton("Open","1"));
        Require(OpenFileButton("打开(&O)",""));
        Require(OpenFileButton("開啟 (&O)",""));
        Require(OpenFileButton("Open (&O)",""));
        Require(!OpenFileButton("Open folder","folder"));
        Require(!OpenFileButton("Send","send"));
        Require(NativeOpenIdentity(true,true,true,true,1,"Button"));
        Require(!NativeOpenIdentity(false,true,true,true,1,"Button"));
        Require(!NativeOpenIdentity(true,true,true,false,1,"Button"));
        Require(!NativeOpenIdentity(true,true,true,true,2,"Button"));
        Require(!NativeOpenIdentity(true,true,true,true,1,"Edit"));
        Require(!NativeOpenIdentity(true,true,false,true,1,"Button"));
        Require(EditorMatches("code;","code;\n"));
        Require(OwnPendingPayload(pending.TrimEnd('\n'),template,fixedMarker));
        Require(MayActivate(1,0,0));
        Require(MayActivate(1,0,1));
        Require(!MayActivate(2,0,1));
        Require(!MayActivate(1,1,1));
        Require(!MayActivate(1,0,2));
        Require(MayUseDialog(true,true,true,true,true));
        Require(!MayUseDialog(false,true,true,true,true));
        Require(!MayUseDialog(true,false,true,true,true));
        Require(!MayUseDialog(true,true,false,true,true));
        Require(!MayUseDialog(true,true,true,false,true));
        Require(!MayUseDialog(true,true,true,true,false));
        Require(expectedParent==0?ParentId(Process.GetCurrentProcess().Id)>0:ParentId(Process.GetCurrentProcess().Id)==expectedParent);
    }
    static void Emit(string state,string errorKind) {
            Console.WriteLine("{\"devToolsOpenMethod\":\""+devToolsOpenMethod+"\",\"state\":\""+state+"\",\"errorKind\":\""+errorKind+"\",\"scriptSubmitted\":"+scriptSubmitted.ToString().ToLowerInvariant()+",\"pickerIdentityBits\":"+pickerIdentityBits+",\"pickerForegroundPid\":"+pickerForegroundPid+",\"pickerOwnerPid\":"+pickerOwnerPid+",\"pickerZeroForegroundSamples\":"+pickerZeroForegroundSamples+",\"pickerWindowClass\":\""+pickerWindowClass+"\",\"pickerForegroundKind\":\""+pickerForegroundKind+"\",\"promptProcessId\":"+promptProcessId+",\"focusedProcessId\":"+focusedProcessId+",\"focusedNameIsPrompt\":"+focusedNameIsPrompt.ToString().ToLowerInvariant()+",\"activationRequested\":"+activationRequested.ToString().ToLowerInvariant()+",\"foregroundKind\":\""+foregroundKind+"\",\"observedForegroundPid\":"+observedForegroundPid+",\"applicationPid\":"+targetPid+",\"applicationStartTicks\":\""+targetStarted+"\",\"uiNodes\":"+uiNodes+",\"tabItems\":"+tabItems+",\"editInputs\":"+editInputs+",\"consoleLabels\":"+consoleLabels+",\"promptReadOnly\":"+promptReadOnly.ToString().ToLowerInvariant()+",\"promptValueLength\":"+promptValueLength+",\"promptValueShape\":\""+promptValueShape+"\",\"writtenValueLength\":"+writtenValueLength+",\"resumedOwnPayload\":"+resumedOwnPayload.ToString().ToLowerInvariant()+",\"catalogDialogState\":\""+catalogDialogState+"\",\"filenameCandidates\":"+filenameCandidates+",\"openCandidates\":"+openCandidates+",\"focusStage\":\""+focusStage+"\",\"foregroundIsDevTools\":"+foregroundIsDevTools.ToString().ToLowerInvariant()+",\"promptHasFocus\":"+promptHasFocus.ToString().ToLowerInvariant()+"}");
    }
    [STAThread] public static int Main(string[] args) {
        try {
            if((args.Length==1 || args.Length==2) && args[0]=="--self-test") { SelfTest(args.Length==2?Int32.Parse(args[1]):0); Console.WriteLine("{\"state\":\"SelfTestPassed\",\"cases\":90,\"uiActions\":0}"); return 0; }
            bool activateClaude=args.Length>0 && args[args.Length-1]=="--activate-claude";
            if(activateClaude)Array.Resize(ref args,args.Length-1);
            if(args.Length>=3 && args[args.Length-3]=="--registry") {
                lifetimeRegistry=Path.GetFullPath(args[args.Length-2]); lifetimeRegistryHash=args[args.Length-1];
                if(!Regex.IsMatch(lifetimeRegistryHash,@"^[a-f0-9]{64}$"))throw new ArgumentException("Invalid registry hash");
                Array.Resize(ref args,args.Length-3);
            }
            if(args.Length>=4 && args[args.Length-4]=="--parent") {
                lifetimeParent=Process.GetProcessById(Int32.Parse(args[args.Length-3]));
                lifetimeParentStarted=Int64.Parse(args[args.Length-2]); lifetimeParentExe=Path.GetFullPath(args[args.Length-1]);
                Array.Resize(ref args,args.Length-4);
            }
            if(args.Length!=5 && args.Length!=7) { Console.WriteLine("{\"state\":\"InvalidArguments\"}"); return 2; }
            string state=Apply(args[0],args[1],args[2],args[3],25000,args.Length==7?args[5]:null,args.Length==7?args[6]:null,activateClaude);
            Emit(state,"");
            return state=="Applied"?0:3;
        } catch(Exception error) {
            Emit("AdapterError",error.GetType().Name); return 4;
        }
    }
}

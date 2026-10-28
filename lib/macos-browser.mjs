// Chrome tab ownership is captured before invoking Claude's debugger menu.
// Only one newly created, exact chrome://inspect tab may be closed. No page
// titles, content or other tab URLs leave the AppleScript process.
import { execFileSync } from 'node:child_process';

const run = (exec, script) => exec('osascript', ['-e', script], { encoding: 'utf8', timeout: 5000 }).trim();

export function snapshotInspectorBrowser(exec = execFileSync) {
  try {
    const output = run(exec, `tell application "System Events"
  set frontPid to unix id of first application process whose frontmost is true
end tell
set chromePid to 0
set tabIds to ""
try
  if application id "com.google.Chrome" is running then
    tell application "System Events" to set chromePid to unix id of first application process whose bundle identifier is "com.google.Chrome"
    tell application id "com.google.Chrome"
      repeat with w in windows
        repeat with t in tabs of w
          set tabIds to tabIds & (id of t as text) & ","
        end repeat
      end repeat
    end tell
  end if
  return (frontPid as text) & "|" & (chromePid as text) & "|" & tabIds
on error
  return (frontPid as text) & "|unavailable|"
end try`);
    const [front, chrome, ids = ''] = output.split('|');
    if (!/^\d+$/.test(front)) return { state: 'unavailable' };
    const frontPid = Number(front);
    if (!/^\d+$/.test(chrome) || !/^(?:\d+,)*$/.test(ids)) return { state: 'unavailable', frontPid };
    return { state: 'captured', frontPid, chromePid: Number(chrome), tabIds: ids.split(',').filter(Boolean).map(Number) };
  } catch { return { state: 'unavailable' }; }
}

export function closeNewInspectorTab(snapshot, claudePid, exec = execFileSync) {
  if (snapshot?.state !== 'captured' || !Array.isArray(snapshot.tabIds)) return { state: 'unavailable', closed: 0 };
  const numbers = [snapshot.frontPid, snapshot.chromePid, claudePid, ...snapshot.tabIds];
  if (!numbers.every(n => Number.isSafeInteger(n) && n >= 0) || !snapshot.frontPid || !claudePid) return { state: 'unavailable', closed: 0 };
  try {
    const output = run(exec, `-- Chrome scripting IDs are text, even when they contain only digits.
set priorIds to {${snapshot.tabIds.map(id => '"' + id + '"').join(',')}}
set closedCount to 0
set newCount to 0
set candidateCount to 0
set chromePid to 0
if application id "com.google.Chrome" is running then
  tell application "System Events" to set chromePid to unix id of first application process whose bundle identifier is "com.google.Chrome"
  if ${snapshot.chromePid} is 0 or chromePid is ${snapshot.chromePid} then
    tell application id "com.google.Chrome"
      set candidates to {}
      repeat with w in windows
        repeat with t in tabs of w
          if (id of t as text) is not in priorIds then
            set newCount to newCount + 1
            set address to URL of t
            if address is "chrome://inspect" or address is "chrome://inspect/" or address is "chrome://inspect/#devices" then set end of candidates to {id of w, id of t}
          end if
        end repeat
      end repeat
      set candidateCount to count of candidates
      if candidateCount is 1 then
        set match to item 1 of candidates
        set winId to item 1 of match
        set tabId to item 2 of match
        tell window id winId
          -- Resolve identity and URL again immediately before closing.
          repeat with t in tabs
            if id of t is tabId then
              set address to URL of t
              if address is "chrome://inspect" or address is "chrome://inspect/" or address is "chrome://inspect/#devices" then
                close t
                set closedCount to 1
              end if
              exit repeat
            end if
          end repeat
        end tell
      end if
    end tell
  end if
end if
tell application "System Events"
  set currentPid to unix id of first application process whose frontmost is true
  if currentPid is chromePid or currentPid is ${claudePid} then
    try
      set frontmost of first application process whose unix id is ${snapshot.frontPid} to true
    end try
  end if
end tell
return (closedCount as text) & "|" & (newCount as text) & "|" & (candidateCount as text)`);
    if (!/^[01](?:\|\d+\|\d+)?$/.test(output)) return { state: 'unavailable', closed: 0 };
    const [closed, newTabs, candidates] = output.split('|').map(Number);
    return { state: closed === 1 ? 'closed-new-tab' : 'no-unique-new-tab', closed, ...(Number.isFinite(newTabs) ? { newTabs, candidates } : {}) };
  } catch { return { state: 'unavailable', closed: 0 }; }
}

export async function tidyInspectorBrowser(snapshot, claudePid, { exec = execFileSync, timeoutMs = 1800, verifyBrowser = snapshotInspectorBrowser, sleep = ms => new Promise(resolve => setTimeout(resolve, ms)) } = {}) {
  if (snapshot?.state !== 'captured' || !Array.isArray(snapshot.tabIds)) return { state: 'unavailable', closed: 0 };
  const deadline = Date.now() + timeoutMs;
  let result;
  do {
    result = closeNewInspectorTab(snapshot, claudePid, exec);
    if (result.state === 'closed-new-tab') {
      const after = verifyBrowser(exec);
      return { ...result, ...(after.state === 'captured' ? {
        baselinePreserved: (snapshot.chromePid === 0 || snapshot.chromePid === after.chromePid) && snapshot.tabIds.every(id => after.tabIds.includes(id)),
        focusRestored: after.frontPid === snapshot.frontPid,
      } : {}) };
    }
    if (result.state !== 'no-unique-new-tab') return result;
    await sleep(150);
  } while (Date.now() < deadline);
  return result;
}

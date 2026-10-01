const electron = require('electron');
const { app, BrowserWindow, ipcMain, dialog, Notification, shell } = (typeof electron === 'object' && electron !== null) ? electron : {};
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const https = require('https');

let pythonProcess = null;
const AI_SERVICE_PORT = 8000;
const AI_SERVICE_URL = `http://127.0.0.1:${AI_SERVICE_PORT}`;

// Resolve the location of the AI service scripts in development or packaged production
function getAIServicePaths() {
  let serverScript = path.join(__dirname, 'ai', 'server.py');
  let workingDir = __dirname;

  if (app && app.isPackaged) {
    const unpackedScript = path.join(process.resourcesPath, 'app.asar.unpacked', 'ai', 'server.py');
    const directScript = path.join(process.resourcesPath, 'app', 'ai', 'server.py');
    if (fs.existsSync(unpackedScript)) {
      serverScript = unpackedScript;
      workingDir = path.join(process.resourcesPath, 'app.asar.unpacked');
    } else if (fs.existsSync(directScript)) {
      serverScript = directScript;
      workingDir = path.join(process.resourcesPath, 'app');
    }
  }

  return { serverScript, workingDir };
}

// Start Python AI Service in background
function startAIService() {
  const { serverScript, workingDir } = getAIServicePaths();

  if (!fs.existsSync(serverScript)) {
    console.warn(`[AI-Service]: Server script not found at ${serverScript}. AI service will not be started automatically.`);
    return;
  }
  
  // Wrap serverScript in quotes so Windows shell handles spaces in path correctly
  pythonProcess = spawn('python', [`"${serverScript}"`], {
    cwd: workingDir,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    shell: true
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[AI-Service Output]: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[AI-Service Error]: ${data.toString().trim()}`);
  });

  pythonProcess.on('error', (err) => {
    console.error(`[AI-Service Spawn Error]: ${err.message}`);
    pythonProcess = null;
  });

  pythonProcess.on('close', (code) => {
    console.log(`[AI-Service]: Process exited with code ${code}`);
    pythonProcess = null;
  });
}

// Stop Python AI Service on exit — reliable process-tree cleanup
function stopAIService() {
  if (!pythonProcess) {
    return;
  }

  const pid = pythonProcess.pid;
  console.log(`[AI-Service]: Terminating Python service process tree (PID: ${pid})...`);

  try {
    if (process.platform === 'win32') {
      // On Windows, when spawned with shell: true, pythonProcess.pid is cmd.exe.
      // Using taskkill /pid <PID> /T /F terminates the entire process tree (cmd.exe and python.exe child).
      // spawnSync ensures the command completes synchronously before Electron exits.
      spawnSync('taskkill', ['/pid', String(pid), '/T', '/F'], {
        stdio: 'ignore',
        windowsHide: true
      });
    } else {
      try {
        process.kill(-pid, 'SIGTERM');
      } catch (e) {
        pythonProcess.kill('SIGTERM');
      }
    }
  } catch (err) {
    console.log(`[AI-Service]: Process cleanup notice: ${err.message}`);
  } finally {
    pythonProcess = null;
  }
}

// Helper for sending HTTP requests to Python service
function makeHTTPRequest(options, postData = null) {
  return new Promise((resolve, reject) => {
    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => body += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(body);
          if (res.statusCode >= 200 && res.statusCode < 300) {
            resolve(parsed);
          } else {
            reject(new Error(parsed.detail || `HTTP Error ${res.statusCode}`));
          }
        } catch (e) {
          resolve(body);
        }
      });
    });

    req.on('error', (err) => reject(err));
    if (postData) {
      req.write(JSON.stringify(postData));
    }
    req.end();
  });
}

/**
 * Safely determines the HTTP client (http or https) and validates URL protocol.
 * Only 'http:' and 'https:' protocols are permitted.
 */
function getHttpClientForUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    throw new Error('A valid URL string is required');
  }
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch (err) {
    throw new Error(`Invalid URL provided: ${err.message}`);
  }

  if (parsed.protocol === 'https:') {
    return { client: https, parsedUrl: parsed };
  } else if (parsed.protocol === 'http:') {
    return { client: http, parsedUrl: parsed };
  } else {
    throw new Error(`Unsupported protocol "${parsed.protocol}". Only HTTP and HTTPS are supported.`);
  }
}

/**
 * Download a remote recording to a local temp file so the Python pipeline can read it.
 * Protocol-aware: supports both http:// and https://, handles redirects securely,
 * enforces a 120s timeout, and cleans up partial files on failure.
 */
function downloadToTempFile(url, filename, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    if (redirectCount > 5) {
      return reject(new Error('Too many redirects while downloading recording'));
    }

    let client, parsedUrl;
    try {
      const res = getHttpClientForUrl(url);
      client = res.client;
      parsedUrl = res.parsedUrl;
    } catch (err) {
      return reject(err);
    }

    const baseName = path.basename(filename || `recording-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const safeName = baseName.replace(/^\.+/, '') || `recording-${Date.now()}`;
    const targetDir = path.resolve(os.tmpdir(), 'echocrm-recordings');
    const targetPath = path.resolve(targetDir, safeName);

    // Enforce that targetPath remains strictly contained within targetDir (anti-path traversal)
    if (!targetPath.startsWith(targetDir + path.sep)) {
      return reject(new Error('Invalid filename: path traversal attempt rejected'));
    }

    try {
      fs.mkdirSync(targetDir, { recursive: true });
    } catch (dirErr) {
      return reject(new Error(`Failed to create temp directory: ${dirErr.message}`));
    }

    let fileStream = null;
    let isCleanedUp = false;

    const cleanup = () => {
      if (isCleanedUp) return;
      isCleanedUp = true;
      if (fileStream) {
        fileStream.destroy();
      }
      if (fs.existsSync(targetPath)) {
        try {
          fs.unlinkSync(targetPath);
        } catch (_) {}
      }
    };

    const request = client.get(parsedUrl, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        try {
          const redirectUrl = new URL(res.headers.location, parsedUrl).href;
          return downloadToTempFile(redirectUrl, filename, redirectCount + 1)
            .then(resolve)
            .catch(reject);
        } catch (redirErr) {
          cleanup();
          return reject(new Error(`Invalid redirect location: ${redirErr.message}`));
        }
      }

      if (res.statusCode !== 200) {
        res.resume();
        cleanup();
        return reject(new Error(`Failed to download recording (HTTP ${res.statusCode})`));
      }

      fileStream = fs.createWriteStream(targetPath);
      res.pipe(fileStream);

      fileStream.on('finish', () => {
        fileStream.close(() => resolve(targetPath));
      });

      fileStream.on('error', (err) => {
        cleanup();
        reject(err);
      });
    });

    request.on('error', (err) => {
      cleanup();
      reject(err);
    });

    request.setTimeout(120000, () => {
      cleanup();
      request.destroy(new Error('Recording download timed out'));
    });
  });
}

// Register IPC Handlers
function setupIPCHandlers() {
  ipcMain.handle('ai:checkHealth', async () => {
    try {
      const options = {
        hostname: '127.0.0.1',
        port: AI_SERVICE_PORT,
        path: '/health',
        method: 'GET',
        timeout: 3000
      };
      const res = await makeHTTPRequest(options);
      return res;
    } catch (err) {
      return {
        status: 'offline',
        error: `Python AI service unreachable: ${err.message}`
      };
    }
  });

  ipcMain.handle('ai:processCall', async (event, audioPath, customerId) => {
    try {
      const options = {
        hostname: '127.0.0.1',
        port: AI_SERVICE_PORT,
        path: '/process-call',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      const payload = { audio_path: audioPath };
      if (customerId) payload.customer_id = customerId;
      const res = await makeHTTPRequest(options, payload);
      return res;
    } catch (err) {
      return {
        status: 'PIPELINE_ERROR',
        transcript: '',
        analysis: {},
        metadata: { errors: [err.message] }
      };
    }
  });

  ipcMain.handle('ai:processSampleCall', async () => {
    try {
      let samplePath = path.join(__dirname, 'test', 'sample-audio', 'Standard recording 18.mp3');
      if (!fs.existsSync(samplePath) && app && app.isPackaged) {
        samplePath = path.join(process.resourcesPath, 'test', 'sample-audio', 'Standard recording 18.mp3');
      }
      if (!fs.existsSync(samplePath)) {
        return {
          status: 'PIPELINE_ERROR',
          transcript: '',
          analysis: {},
          metadata: { errors: ['Sample audio file is not bundled with this build. Please upload or record an audio file.'] }
        };
      }
      const options = {
        hostname: '127.0.0.1',
        port: AI_SERVICE_PORT,
        path: '/process-call',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }
      };
      const res = await makeHTTPRequest(options, { audio_path: samplePath });
      return res;
    } catch (err) {
      return {
        status: 'PIPELINE_ERROR',
        transcript: '',
        analysis: {},
        metadata: { errors: [err.message] }
      };
    }
  });

  ipcMain.handle('recording:download', async (event, { url, filename }) => {
    if (!url) {
      throw new Error('No recording URL provided');
    }
    return downloadToTempFile(url, filename);
  });

  ipcMain.handle('export:pdf', async (event, { html, filename }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export as PDF',
      defaultPath: filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }]
    });

    if (canceled || !filePath) {
      return { success: false, canceled: true };
    }

    const printWindow = new BrowserWindow({ show: false, webPreferences: { sandbox: true } });
    try {
      await printWindow.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
      const pdfData = await printWindow.webContents.printToPDF({ printBackground: true });
      fs.writeFileSync(filePath, pdfData);
      return { success: true, filePath };
    } finally {
      printWindow.destroy();
    }
  });

  ipcMain.handle('notify:show', async (event, { title, body }) => {
    if (!Notification.isSupported()) {
      return { success: false, error: 'Notifications are not supported on this system.' };
    }
    new Notification({ title: title || 'EchoCRM', body: body || '' }).show();
    return { success: true };
  });
}


function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 830,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      sandbox: false, // Sandbox set to false so preload can access IPC cleanly
    },
    title: 'EchoCRM',
    autoHideMenuBar: true,
    show: false
  });

  // Display the window when content is fully loaded to prevent flickering
  win.once('ready-to-show', () => {
    win.show();
  });

  // Security: Deny unmonitored popups and route external links to default OS browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('https://') || url.startsWith('http://')) {
      if (shell && shell.openExternal) {
        shell.openExternal(url);
      }
    }
    return { action: 'deny' };
  });

  // Security: Prevent in-window navigation away from the local application
  win.webContents.on('will-navigate', (event, navigationUrl) => {
    try {
      const parsed = new URL(navigationUrl);
      if (process.env.NODE_ENV === 'development' && parsed.origin === 'http://localhost:5173') {
        return;
      }
      if (navigationUrl.startsWith('file://')) {
        return;
      }
    } catch (_) {}

    event.preventDefault();
    if (navigationUrl.startsWith('https://') || navigationUrl.startsWith('http://')) {
      if (shell && shell.openExternal) {
        shell.openExternal(navigationUrl);
      }
    }
  });

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

if (app && app.whenReady) {
  app.whenReady().then(() => {
    startAIService();
    setupIPCHandlers();
    createWindow();

    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
      }
    });
  });

  app.on('before-quit', () => {
    stopAIService();
  });

  app.on('will-quit', () => {
    stopAIService();
  });

  app.on('window-all-closed', () => {
    stopAIService();
    if (process.platform !== 'darwin') {
      app.quit();
    }
  });
}

// Process signal listeners to prevent orphaned processes on abrupt exit
process.on('exit', () => {
  stopAIService();
});

process.on('SIGINT', () => {
  stopAIService();
  process.exit(0);
});

process.on('SIGTERM', () => {
  stopAIService();
  process.exit(0);
});

module.exports = {
  getHttpClientForUrl,
  downloadToTempFile,
  startAIService,
  stopAIService
};



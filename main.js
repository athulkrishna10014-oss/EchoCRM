const { app, BrowserWindow, ipcMain, dialog, Notification } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn } = require('child_process');
const http = require('http');
const https = require('https');

let pythonProcess = null;
const AI_SERVICE_PORT = 8000;
const AI_SERVICE_URL = `http://127.0.0.1:${AI_SERVICE_PORT}`;

// Start Python AI Service in background
function startAIService() {
  const serverScript = path.join(__dirname, 'ai', 'server.py');
  
  // Wrap serverScript in quotes so Windows shell handles spaces in path correctly
  pythonProcess = spawn('python', [`"${serverScript}"`], {
    cwd: __dirname,
    env: { ...process.env, PYTHONUNBUFFERED: '1' },
    shell: true
  });

  pythonProcess.stdout.on('data', (data) => {
    console.log(`[AI-Service Output]: ${data.toString().trim()}`);
  });

  pythonProcess.stderr.on('data', (data) => {
    console.error(`[AI-Service Error]: ${data.toString().trim()}`);
  });

  pythonProcess.on('close', (code) => {
    console.log(`[AI-Service]: Process exited with code ${code}`);
    pythonProcess = null;
  });
}

// Stop Python AI Service on exit
function stopAIService() {
  if (pythonProcess) {
    console.log('[AI-Service]: Terminating Python service process...');
    if (process.platform === 'win32') {
      spawn('taskkill', ['/pid', pythonProcess.pid, '/f', '/t']);
    } else {
      pythonProcess.kill();
    }
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

// Download a remote recording to a local temp file so the Python pipeline can read it.
function downloadToTempFile(url, filename) {
  return new Promise((resolve, reject) => {
    const safeName = (filename || `recording-${Date.now()}`).replace(/[^a-zA-Z0-9._-]/g, '_');
    const targetPath = path.join(os.tmpdir(), 'echocrm-recordings', safeName);

    fs.mkdirSync(path.dirname(targetPath), { recursive: true });

    const request = https.get(url, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        downloadToTempFile(res.headers.location, filename).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`Failed to download recording (HTTP ${res.statusCode})`));
        return;
      }

      const fileStream = fs.createWriteStream(targetPath);
      res.pipe(fileStream);
      fileStream.on('finish', () => {
        fileStream.close(() => resolve(targetPath));
      });
      fileStream.on('error', (err) => reject(err));
    });

    request.on('error', (err) => reject(err));
    request.setTimeout(120000, () => {
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
      const samplePath = path.join('test', 'sample-audio', 'Standard recording 18.mp3');
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

  if (process.env.NODE_ENV === 'development') {
    win.loadURL('http://localhost:5173');
    win.webContents.openDevTools();
  } else {
    win.loadFile(path.join(__dirname, 'dist/index.html'));
  }
}

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

app.on('window-all-closed', () => {
  stopAIService();
  if (process.platform !== 'darwin') {
    app.quit();
  }
});


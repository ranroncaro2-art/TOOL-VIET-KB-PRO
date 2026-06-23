const { app, BrowserWindow } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
const net = require('net');

let mainWindow = null;
let backendProcess = null;
let frontendProcess = null;

const BACKEND_PORT = 8000;
const FRONTEND_PORT = 3001;

function getPaths() {
    const isDev = !app.isPackaged;
    const resourcesPath = isDev 
        ? path.join(__dirname, '..') 
        : process.resourcesPath;
    
    const backendExe = isDev
        ? path.join(resourcesPath, 'backend_dist', 'backend.exe')
        : path.join(resourcesPath, 'backend', 'backend.exe');

    const serverJs = isDev
        ? path.join(resourcesPath, 'frontend', '.next', 'standalone', 'server.js')
        : path.join(resourcesPath, 'frontend', 'server.js');

    const nodeBin = isDev
        ? 'node'
        : path.join(resourcesPath, 'bin', 'node.exe');

    return { backendExe, serverJs, nodeBin, isDev };
}

function checkPort(port, callback) {
    const server = net.createServer();
    server.once('error', (err) => {
        if (err.code === 'EADDRINUSE') {
            callback(true); // Port is active
        } else {
            callback(false);
        }
    });
    server.once('listening', () => {
        server.close();
        callback(false); // Port is free
    });
    server.listen(port, '127.0.0.1');
}

function waitForServer(port, timeoutMs, callback) {
    const startTime = Date.now();
    const checkInterval = setInterval(() => {
        checkPort(port, (isActive) => {
            if (isActive) {
                clearInterval(checkInterval);
                callback(true);
            } else if (Date.now() - startTime > timeoutMs) {
                clearInterval(checkInterval);
                callback(false);
            }
        });
    }, 200);
}

function startServices() {
    const { backendExe, serverJs, nodeBin, isDev } = getPaths();
    
    // Ensure data/storage directories are created next to the application executable in production
    if (!isDev) {
        const appDir = path.dirname(app.getPath('exe'));
        process.chdir(appDir);
    }

    console.log(`Working Directory: ${process.cwd()}`);
    console.log(`Backend Path: ${backendExe}`);
    console.log(`Frontend Path: ${serverJs}`);
    console.log(`Node Path: ${nodeBin}`);

    // 1. Start Python FastAPI Backend
    if (fs.existsSync(backendExe)) {
        console.log("Starting backend process...");
        backendProcess = spawn(backendExe, [], {
            windowsHide: true,
            stdio: 'ignore'
        });

        backendProcess.on('error', (err) => {
            console.error(`Failed to start backend: ${err}`);
        });
    } else {
        console.error(`Backend executable not found at: ${backendExe}`);
    }

    // 2. Start Next.js Standalone Frontend
    if (fs.existsSync(serverJs)) {
        console.log("Starting frontend process...");
        const env = { ...process.env };
        env.PORT = String(FRONTEND_PORT);
        env.HOSTNAME = 'localhost';
        env.NODE_ENV = 'production';

        frontendProcess = spawn(nodeBin, [serverJs], {
            env: env,
            windowsHide: true,
            stdio: 'ignore'
        });

        frontendProcess.on('error', (err) => {
            console.error(`Failed to start frontend: ${err}`);
        });
    } else {
        console.error(`Frontend server.js not found at: ${serverJs}`);
    }
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        title: "Novel Writer V3",
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Remove top menu bar for application look
    mainWindow.setMenuBarVisibility(false);

    // Wait for the Next.js server to be active before loading
    waitForServer(FRONTEND_PORT, 15000, (ready) => {
        if (ready) {
            mainWindow.loadURL(`http://localhost:${FRONTEND_PORT}`);
        } else {
            mainWindow.loadURL(`data:text/html,<html><body style="background:#1e1e2e;color:#f38ba8;font-family:sans-serif;text-align:center;padding-top:20%;"><h2>Failed to start servers. Please restart the app.</h2></body></html>`);
        }
    });

    mainWindow.on('closed', () => {
        mainWindow = null;
    });
}

app.on('ready', () => {
    startServices();
    createWindow();
});

app.on('window-all-closed', () => {
    // Shutdown processes cleanly
    if (backendProcess) {
        try { backendProcess.kill(); } catch (e) {}
    }
    if (frontendProcess) {
        try { frontendProcess.kill(); } catch (e) {}
    }
    app.quit();
});

app.on('activate', () => {
    if (mainWindow === null) {
        createWindow();
    }
});

const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require("node:fs/promises");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

const isDevelopment = !app.isPackaged;

if (isDevelopment) {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "RiverLabDoudizhu-dev"),
  );
} else {
  app.setPath(
    "userData",
    path.join(app.getPath("appData"), "RiverLabDoudizhu"),
  );
}

const savePath = () => path.join(app.getPath("userData"), "save.json");
const backupPath = () => path.join(app.getPath("userData"), "save.backup.json");

async function readJson(filePath) {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content);
}

async function loadSave() {
  try {
    return await readJson(savePath());
  } catch {
    try {
      return await readJson(backupPath());
    } catch {
      return null;
    }
  }
}

async function saveGame(data) {
  const folder = app.getPath("userData");
  const target = savePath();
  const backup = backupPath();
  const temporary = path.join(folder, "save.tmp.json");

  try {
    await fs.mkdir(folder, { recursive: true });
    await fs.writeFile(temporary, JSON.stringify(data, null, 2), "utf8");
    try {
      await fs.copyFile(target, backup);
    } catch {
      // The first save has no previous file to back up.
    }
    await fs.rm(target, { force: true });
    await fs.rename(temporary, target);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 1024,
    minHeight: 700,
    backgroundColor: "#0a653f",
    title: "河畔斗地主",
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith("https://")) shell.openExternal(url);
    return { action: "deny" };
  });
  window.webContents.on("will-navigate", (event) => event.preventDefault());

  if (isDevelopment) {
    window.loadURL(process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173");
  } else {
    window.loadFile(path.join(__dirname, "..", "dist", "index.html"));
  }
}

ipcMain.handle("save:load", loadSave);
ipcMain.handle("save:write", (_event, data) => saveGame(data));

app.whenReady().then(() => {
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

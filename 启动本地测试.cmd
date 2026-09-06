@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 首次运行需要安装开发依赖，请先运行：npm install
  pause
  exit /b 1
)
echo 正在启动河畔斗地主……
npm run dev
if errorlevel 1 pause

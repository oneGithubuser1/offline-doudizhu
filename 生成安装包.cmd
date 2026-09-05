@echo off
chcp 65001 >nul
cd /d "%~dp0"
if not exist node_modules (
  echo 尚未安装开发依赖，请先运行：npm install
  pause
  exit /b 1
)
echo 正在运行测试并生成 Windows 安装包……
npm run dist
if errorlevel 1 (
  echo 打包失败，请查看上方错误信息。
) else (
  echo 安装包已经生成在 release 文件夹。
)
pause

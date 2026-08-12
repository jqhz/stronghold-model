@echo off
setlocal
cd /d "%~dp0"

call build.bat
if errorlevel 1 exit /b 1

set FAT_DIR=build\fat-tmp
set MANIFEST=build\MANIFEST.MF
set OUT_JAR=..\..\app\stronghold-viewer.jar

if exist "%FAT_DIR%" rmdir /s /q "%FAT_DIR%"
mkdir "%FAT_DIR%"

echo [INFO] Extracting dependency jars into fat jar workspace...
pushd "%FAT_DIR%"
for %%f in (..\..\lib\*.jar) do (
  jar xf "%%f"
)
popd

echo [INFO] Adding compiled classes...
xcopy /E /I /Y "build\classes\*" "%FAT_DIR%\" >nul

echo [INFO] Removing signed-jar metadata (safe for uber-jar)...
if exist "%FAT_DIR%\META-INF" (
  del /q "%FAT_DIR%\META-INF\*.SF" 2>nul
  del /q "%FAT_DIR%\META-INF\*.DSA" 2>nul
  del /q "%FAT_DIR%\META-INF\*.RSA" 2>nul
)

(
echo Manifest-Version: 1.0
echo Main-Class: stronghold.StrongholdViewerMain
) > "%MANIFEST%"

if not exist "..\..\app" mkdir "..\..\app"
jar cfm "%OUT_JAR%" "%MANIFEST%" -C "%FAT_DIR%" .
if errorlevel 1 (
  echo [ERROR] Failed to create fat jar.
  exit /b 1
)

echo [INFO] Built %OUT_JAR%
exit /b 0

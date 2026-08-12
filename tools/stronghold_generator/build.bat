@echo off
setlocal
cd /d "%~dp0"

if not exist "src\stronghold\StrongholdViewerMain.java" (
  echo [ERROR] Missing source file: src\stronghold\StrongholdViewerMain.java
  exit /b 1
)

if not exist "lib\FeatureUtils-1.0.0.jar" (
  echo [ERROR] Missing lib jars. Run setup_libs.ps1 first.
  exit /b 1
)

if not exist "build\classes" mkdir "build\classes"

echo [INFO] Compiling stronghold generator...
javac -encoding UTF-8 -cp "lib/*" -d "build\classes" "src\stronghold\StrongholdViewerMain.java"
if errorlevel 1 (
  echo [ERROR] Compilation failed.
  exit /b 1
)

echo [INFO] Built classes in tools\stronghold_generator\build\classes
exit /b 0

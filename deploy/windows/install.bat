@echo off
title Requestick Setup
echo.
echo  Requestick Setup
echo  This machine will host the board. Sales desks only need Chrome or Edge.
echo.
net session >nul 2>&1
if %errorLevel% neq 0 (
  echo  Right-click this file and choose Run as administrator.
  echo.
  pause
  exit /b 1
)
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0install.ps1" %*
echo.
pause

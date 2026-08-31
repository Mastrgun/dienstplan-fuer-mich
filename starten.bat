@echo off
cd /d "%~dp0"
python starten.py
if errorlevel 1 pause

@echo off
cd /d "%~dp0"
corepack yarn dev --port 5173 --strictPort

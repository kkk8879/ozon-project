@echo off
powershell -ExecutionPolicy Bypass -File "%~dp0scripts\ops-local-recover.ps1" %*

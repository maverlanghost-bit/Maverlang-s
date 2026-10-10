@echo off
rem Wrapper opencode: limpia vars MSYS de ruta (/c/...) que confunden a opencode.
cd /d "%~dp0"
set PWD=
set OLDPWD=
set SHLVL=
set MSYSTEM=
opencode %*

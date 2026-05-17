@echo off
cd /d "%~dp0"
python -X utf8 scheduler.py >> scheduler.log 2>&1

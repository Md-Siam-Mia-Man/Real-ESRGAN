@echo off

:: Activate the conda environment for Real-ESRGAN
CALL "C:\ProgramData\<Your Anaconda Distribution Name>\Scripts\activate.bat" Real-ESRGAN

:: Navigate to the Real-ESRGAN directory (Change path according to yours)
cd /D path/to/your/Real-ESRGAN

:: Run Real-ESRGAN
python app.py
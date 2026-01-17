#!/usr/bin/env python
"""
Run AI Module server
"""
import subprocess
import sys
import os

# Убедитесь, что мы в правильной директории
os.chdir(os.path.dirname(__file__))

# Запускаем uvicorn через subprocess
cmd = [
    sys.executable, "-m", "uvicorn",
    "main:app",
    "--host", "0.0.0.0",
    "--port", "8001",
    "--timeout-graceful-shutdown", "30"
]

print(f"Starting AI Module: {' '.join(cmd)}")
subprocess.run(cmd)

#!/usr/bin/env python3
"""
Эмуляция входящего телефонного звонка.
Отправляет POST запрос на API бекенда с номером телефона и аудиофайлом.
"""

import requests
import sys
import os

API_BASE = "http://localhost:3000/api"
AUDIO_FILE_PATH = "test_audio.wav"  # можно использовать любой аудиофайл, если нет - будет без аудио

def emulate_call(phone_number, audio_path=None):
    """Эмулирует звонок с указанного номера."""
    url = f"{API_BASE}/cases/incoming-call"
    
    # Если аудиофайл существует, загружаем его в AI модуль для транскрипции
    audio_url = None
    if audio_path and os.path.exists(audio_path):
        # Загружаем файл в AI модуль (транскрипция)
        with open(audio_path, "rb") as f:
            files = {"file": (os.path.basename(audio_path), f, "audio/wav")}
            try:
                resp = requests.post("http://localhost:8001/transcribe", files=files)
                if resp.status_code == 200:
                    print(f"Транскрипция: {resp.json().get('text', '')}")
                else:
                    print(f"Ошибка транскрипции: {resp.status_code}")
            except Exception as e:
                print(f"Не удалось выполнить транскрипцию: {e}")
        # В реальной системе audio_url будет ссылкой на сохранённый файл
        # Для эмуляции просто укажем фиктивный URL
        audio_url = f"http://storage.example.com/audio/{os.path.basename(audio_path)}"
    
    # Отправляем данные о звонке
    payload = {
        "phoneNumber": phone_number,
        "audioUrl": audio_url
    }
    
    try:
        response = requests.post(url, json=payload)
        if response.status_code == 201 or response.status_code == 200:
            case = response.json()
            print(f"УСПЕХ: Звонок от {phone_number} успешно обработан.")
            print(f"   ID дела: {case.get('id')}")
            print(f"   Категория: {case.get('category')}")
            print(f"   Приоритет: {case.get('priority')}")
            print(f"   Статус: {case.get('status')}")
            return case
        else:
            print(f"ОШИБКА API: {response.status_code}")
            print(response.text)
            return None
    except requests.exceptions.ConnectionError:
        print("ОШИБКА: Не удалось подключиться к бекенду. Убедитесь, что сервер запущен на localhost:3000")
        return None

if __name__ == "__main__":
    # Номер по умолчанию
    phone = "87074536449"
    if len(sys.argv) > 1:
        phone = sys.argv[1]
    
    audio = AUDIO_FILE_PATH if os.path.exists(AUDIO_FILE_PATH) else None
    
    print(f"Эмуляция звонка с номера {phone}...")
    result = emulate_call(phone, audio)
    if result:
        print("Готово. Проверьте список дел в интерфейсе (http://localhost:5174).")
    else:
        print("Эмуляция не удалась.")
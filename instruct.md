
### Как запустить проект локально

Сначала клонировать репозиторий и перейти в него:

```powershell
git clone https://github.com/BAITC-Hacks/hack-37187286-stu-students.git
cd hack-37187286-stu-students
git checkout salamat-tree
```

Проверить Python:

```powershell
python --version
```

Нужен Python 3.12+.

Создать виртуальное окружение:

```powershell
python -m venv venv
```

Активировать:

```powershell
.\venv\Scripts\Activate.ps1
```

Если PowerShell запрещает запуск скриптов:

```powershell
Set-ExecutionPolicy -Scope Process -ExecutionPolicy Bypass
.\venv\Scripts\Activate.ps1
```

Установить зависимости:

```powershell
pip install -r requirements.txt
```

Создать локальный `.env`:

```powershell
Copy-Item .env.example .env
```

Пока AI можно не настраивать. Тогда `.env` может остаться таким:

```env
LLM_API_KEY=
LLM_MODEL=
LLM_BASE_URL=https://api.openai.com/v1
```

Запустить backend:

```powershell
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001
```

Проверка backend:

```text
http://127.0.0.1:8001/api/health
```

Должно быть примерно:

```json
{
  "status": "ok",
  "ai_configured": false
}
```

Если `8001` занят, использовать другой:

```powershell
uvicorn backend.main:app --reload --host 127.0.0.1 --port 8010
```

---

### Запуск frontend

Во втором PowerShell:

```powershell
cd frontend
npm install
npm run dev
```

Обычно Vite даст адрес:

```text
http://127.0.0.1:5173
```

Открываете его в браузере.

Если frontend не видит backend, тогда надо проверить, на какой порт настроен API/proxy. Если backend у вас на `8001`, а frontend ожидает `8000`, это нужно синхронизировать.

---

### Как проверить проект

В корне проекта:

```powershell
pytest
```

Или отдельно:

```powershell
pytest tests/test_simulator.py -v
pytest tests/test_api.py -v
pytest tests/test_agent.py -v
```

Минимальный ручной тест:

```text
1. Открыть frontend
2. Выбрать/загрузить 5 решений
3. Нажать "Рассчитать стратегию"
4. Проверить бюджет
5. Проверить Score до/после
6. Проверить изменения районов
7. Проверить синергии
8. Изменить одно решение и убедиться, что Score изменился
```

Для demo-набора:

```text
M7  -> Нура
M8  -> Нура
M10 -> Нура
M12 -> Город
M5  -> Сарыарка
```

Ожидаемо:

* бюджет `95`
* Score примерно `56.5`
* критические показатели `2 -> 0`

---

### Если хотите AI Advisor

В `.env`:

```env
LLM_API_KEY=ваш_ключ
LLM_MODEL=название_модели
LLM_BASE_URL=https://api.openai.com/v1
```

После изменения `.env` перезапустить backend.

Проверить:

```text
http://127.0.0.1:8001/api/health
```

Теперь должно быть:

```json
{
  "status": "ok",
  "ai_configured": true
}
```

### Самый короткий вариант для чата команды

```text
1. git clone repo
2. git checkout salamat-tree
3. python -m venv venv
4. .\venv\Scripts\Activate.ps1
5. pip install -r requirements.txt
6. Copy-Item .env.example .env
7. uvicorn backend.main:app --reload --host 127.0.0.1 --port 8001

Во втором терминале:
8. cd frontend
9. npm install
10. npm run dev

Проверка:
http://127.0.0.1:8001/api/health
и frontend на адресе, который покажет Vite.
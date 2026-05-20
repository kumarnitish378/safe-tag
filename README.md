# SafeTag

QR + RFID/NFC Emergency Identity Tag platform for India.

Architecture from SDD v3.0:

```text
Browser -> Node.js/Express + EJS -> Flask REST API -> Database
```

Flask returns JSON only. Node.js renders every HTML page.

## Project Layout

```text
safe-tag/
├── backend/
│   ├── app.py              # Flask REST API, models, 37 API routes
│   ├── requirements.txt    # Python dependencies from SDD Section 11
│   ├── Procfile
│   ├── .env.example
│   ├── seed.py
│   └── scripts/factory.py
├── frontend/
│   ├── server.js           # Express + EJS frontend server
│   ├── package.json
│   ├── views/              # 26 EJS pages
│   └── public/js/
├── app.py                  # Root compatibility import for local Flask commands
└── requirements.txt        # Installs backend requirements
```

## Run Locally

Install backend dependencies:

```powershell
.\.venv\Scripts\python.exe -m pip install -r backend\requirements.txt
```

Seed development data:

```powershell
.\.venv\Scripts\python.exe backend\seed.py
```

Start Flask API:

```powershell
cd backend
..\.venv\Scripts\python.exe app.py
```

Or from the project root:

```powershell
.\.venv\Scripts\python.exe backend\app.py
```

Install frontend dependencies:

```powershell
cd frontend
npm install
```

Start Node frontend:

```powershell
node server.js
```

Open:

```text
Frontend: http://127.0.0.1:3000
Backend:  http://127.0.0.1:5000/api/health
```

## Test Data

Customer:

```text
customer@test.com / Test@1234
```

Manufacturer:

```text
mfr@test.com / Test@1234
```

Admin:

```text
admin@test.com / Admin@1234
```

Test URLs:

```text
Emergency:    http://127.0.0.1:3000/TESTACT1/testkey00001
Registration: http://127.0.0.1:3000/TESTINAC/testkey00002
```

Factory:

```powershell
cd backend
..\.venv\Scripts\python.exe scripts\factory.py --qty 100 --batch "Batch Name"
```

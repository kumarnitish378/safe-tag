# SafeTag Project Structure

```text
safe-tag/
├── backend/
│   ├── app.py              # Flask REST API only; JSON responses from every route
│   ├── requirements.txt
│   ├── Procfile
│   ├── .env.example
│   ├── seed.py
│   └── scripts/
│       └── factory.py
├── frontend/
│   ├── server.js           # Node.js + Express + EJS
│   ├── package.json
│   ├── views/              # All HTML templates
│   └── public/js/
│       └── emergency.js
├── docs/
├── app.py                  # Thin compatibility import
├── Procfile
└── requirements.txt
```

The backend has no templates folder and does not render HTML. The frontend has no React/Vue framework and renders all pages with EJS.
